// Co-signs a partially-signed "pay with SOL" transaction built by the
// frontend. The gateway's role is to *only* add the mint authority
// signature, and only when the tx matches the expected shape:
//
//   [optional createATA]
//   SystemProgram.transfer   : buyer -> treasury (SOL equivalent)
//   Token::mintTo            : USDC mint -> buyer ATA, authority = deploy key
//   ExchangeProgram::subscribe
//
// Anything else is rejected. The mint authority keypair never signs
// arbitrary transactions — only these three ixs stitched in this order.

const fs = require('node:fs');
const {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
} = require('@solana/web3.js');
const {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  AccountLayout,
  getAssociatedTokenAddressSync,
  createMintToInstruction,
} = require('@solana/spl-token');

const config = require('./config');
const chain = require('./chain');
const logger = require('./logger');
const solPrice = require('./sol-price');

const SLIPPAGE_BPS_MAX = 300; // cap the slippage buyers can claim to 3 %

// Forgiving secret-key parser — lets Railway dashboards paste the JSON array
// with or without enclosing brackets without breaking the gateway boot.
function parseSecret(raw) {
  const trimmed = String(raw).trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) { /* fall through */ }
  const inner = trimmed.replace(/^[\[\(]+/, '').replace(/[\]\)]+$/, '');
  return inner.split(/[,\s]+/).filter(Boolean).map((n) => Number(n));
}

let cachedKeypair = null;
function mintAuthority() {
  if (cachedKeypair) return cachedKeypair;
  // Inline JSON env wins over filesystem path — Railway containers have no
  // host-level keypair files, so we ship the bytes via env.
  const inline = process.env.GATEWAY_MINT_AUTHORITY_JSON;
  if (inline && inline.trim()) {
    cachedKeypair = Keypair.fromSecretKey(Uint8Array.from(parseSecret(inline)));
    return cachedKeypair;
  }
  if (!config.mintAuthorityKeypairPath) {
    throw new Error('GATEWAY_MINT_AUTHORITY_JSON or GATEWAY_MINT_AUTHORITY_KEYPAIR_PATH not configured');
  }
  const raw = JSON.parse(fs.readFileSync(config.mintAuthorityKeypairPath, 'utf8'));
  cachedKeypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  return cachedKeypair;
}

function assertPubkey(actual, expected, field) {
  if (!actual.equals(expected)) {
    const e = new Error(`${field} mismatch: got ${actual.toBase58()}, expected ${expected.toBase58()}`);
    e.status = 422;
    throw e;
  }
}

function deserializeTransaction(base64) {
  try {
    return Transaction.from(Buffer.from(base64, 'base64'));
  } catch (err) {
    const e = new Error('tx_decode_failed');
    e.status = 400;
    throw e;
  }
}

async function resolveListing(listingPubkey) {
  const prog = chain.getProgram();
  try {
    return await prog.account.dataListing.fetch(listingPubkey);
  } catch {
    const e = new Error('listing_not_found');
    e.status = 404;
    throw e;
  }
}

function exchangePda() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('data_exchange')],
    chain.getProgramId()
  )[0];
}

async function resolveExchange() {
  const prog = chain.getProgram();
  try {
    return await prog.account.dataExchange.fetch(exchangePda());
  } catch {
    const e = new Error('exchange_not_initialized');
    e.status = 500;
    throw e;
  }
}

async function coSignAndSubmit({
  serializedTx,
  listingPubkey,
  buyer,
  durationMonths,
  solLamports,
  solPriceUsd,
  slippageBps,
}) {
  if (slippageBps < 0 || slippageBps > SLIPPAGE_BPS_MAX) {
    const e = new Error('slippage_out_of_range');
    e.status = 400;
    throw e;
  }

  const tx = deserializeTransaction(serializedTx);
  const authority = mintAuthority();
  const listing = await resolveListing(new PublicKey(listingPubkey));
  const exchange = await resolveExchange();

  const expectedUsdc = BigInt(listing.priceSubscriptionMonthly.toString()) * BigInt(durationMonths);

  // --- tighten the tx shape -------------------------------------------

  // Walk past any leading ComputeBudget ixs — Phantom and most modern
  // wallets auto-prepend setComputeUnitLimit / setComputeUnitPrice before
  // the user's ixs run, so the payload the gateway sees often has 5 or 6
  // instructions even though the "real" ones are 3.
  let cursor = 0;
  while (
    cursor < tx.instructions.length &&
    tx.instructions[cursor].programId.equals(ComputeBudgetProgram.programId)
  ) {
    cursor += 1;
  }

  // After skipping compute-budget, we need 3 or 4 ixs: optional createATA,
  // mandatory SystemTransfer + MintTo + subscribe.
  const remaining = tx.instructions.length - cursor;
  if (remaining < 3 || remaining > 4) {
    const e = new Error(`unexpected_ix_count: ${tx.instructions.length} (core=${remaining})`);
    e.status = 422;
    throw e;
  }

  // first post-compute ix may be createAssociatedTokenAccount; detect and skip.
  if (tx.instructions[cursor].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
    cursor += 1;
  }

  const transferIx = tx.instructions[cursor];
  const mintIx = tx.instructions[cursor + 1];
  const subscribeIx = tx.instructions[cursor + 2];

  if (!transferIx || !mintIx || !subscribeIx) {
    const e = new Error('missing_required_ix');
    e.status = 422;
    throw e;
  }

  // 1) System transfer — buyer -> treasury wallet, matches declared lamports
  assertPubkey(transferIx.programId, SystemProgram.programId, 'transfer.programId');
  // system::transfer layout: first key is source, second is destination.
  const fromKey = transferIx.keys[0]?.pubkey;
  const toKey = transferIx.keys[1]?.pubkey;
  if (!fromKey?.equals(new PublicKey(buyer))) {
    const e = new Error('transfer.from must be buyer');
    e.status = 422;
    throw e;
  }
  assertPubkey(toKey, exchange.treasury, 'transfer.to');

  // Decode SystemInstruction::Transfer data (4-byte little-endian discriminator
  // = 2, followed by 8-byte lamports LE).
  const transferData = transferIx.data;
  if (transferData.length !== 12 || transferData.readUInt32LE(0) !== 2) {
    const e = new Error('transfer payload malformed');
    e.status = 422;
    throw e;
  }
  const txLamports = transferData.readBigUInt64LE(4);
  if (txLamports !== BigInt(solLamports)) {
    const e = new Error(`transfer lamports mismatch: ${txLamports} vs ${solLamports}`);
    e.status = 422;
    throw e;
  }

  // Verify declared SOL amount matches the USDC the buyer is trying to unlock
  // within the declared slippage tolerance. The price is fetched server-side
  // from a trusted oracle — client's solPriceUsd is only used as a sanity
  // check (it must agree with the oracle within the deviation tolerance).
  const trustedSolUsd = await solPrice.getTrustedSolUsd();
  solPrice.assertClientPriceAgrees(solPriceUsd, trustedSolUsd);
  const expectedLamportsNoSlip = Number(expectedUsdc) * 1_000 / trustedSolUsd;
  const minLamports = Math.floor(expectedLamportsNoSlip * (1 - slippageBps / 10_000));
  const maxLamports = Math.ceil(expectedLamportsNoSlip * (1 + slippageBps / 10_000));
  const lamportsNum = Number(solLamports);
  if (lamportsNum < minLamports || lamportsNum > maxLamports) {
    const e = new Error(
      `sol amount out of slippage window: ${lamportsNum} lamports, expected ${minLamports}..${maxLamports}`
    );
    e.status = 422;
    throw e;
  }

  // 2) MintTo — authority = our mint authority, mint = configured USDC mint,
  // dest = buyer's ATA, amount = expected USDC raw.
  assertPubkey(mintIx.programId, TOKEN_PROGRAM_ID, 'mint.programId');
  // createMintToInstruction keys: [mint, dest, authority, ...multisig]
  const mintAcc = mintIx.keys[0]?.pubkey;
  const destAcc = mintIx.keys[1]?.pubkey;
  const authAcc = mintIx.keys[2]?.pubkey;
  const usdcMint = new PublicKey(require('./config').usdcMint || 'HaSyCU2nb7ffrfepbDccqB2Q2oGin9V9YkFjjAcdpQXd');
  assertPubkey(mintAcc, usdcMint, 'mint.mint');
  assertPubkey(authAcc, authority.publicKey, 'mint.authority');
  const expectedBuyerAta = getAssociatedTokenAddressSync(usdcMint, new PublicKey(buyer));
  assertPubkey(destAcc, expectedBuyerAta, 'mint.destination');

  // mintTo data: [9 (discriminator)][8-byte LE amount]
  if (mintIx.data.length !== 9 || mintIx.data[0] !== 7) {
    const e = new Error('mintTo payload malformed');
    e.status = 422;
    throw e;
  }
  const mintAmount = mintIx.data.readBigUInt64LE(1);
  if (mintAmount !== expectedUsdc) {
    const e = new Error(`mint amount mismatch: ${mintAmount} vs ${expectedUsdc}`);
    e.status = 422;
    throw e;
  }

  // 3) Subscribe — routed to the exchange program, buyer is the 8th account
  // in our Subscribe struct (exchange, listing, subscription, buyer_usdc,
  // provider_usdc, treasury_usdc, provider, buyer, token, system).
  assertPubkey(subscribeIx.programId, chain.getProgramId(), 'subscribe.programId');
  const buyerInSub = subscribeIx.keys.find((k) => k.isSigner && !k.pubkey.equals(authority.publicKey));
  if (!buyerInSub?.pubkey.equals(new PublicKey(buyer))) {
    const e = new Error('subscribe buyer not present as signer');
    e.status = 422;
    throw e;
  }

  // All checks passed — attach our signature and submit.
  try {
    tx.partialSign(authority);
  } catch (err) {
    const e = new Error('co-sign failed: ' + err.message);
    e.status = 500;
    throw e;
  }

  const connection = chain.getConnection();
  const raw = tx.serialize();
  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(sig, 'confirmed');

  logger.info({ sig, buyer, listingPubkey, solLamports, durationMonths }, 'sol-subscribe complete');
  return { sig };
}

module.exports = { coSignAndSubmit };
