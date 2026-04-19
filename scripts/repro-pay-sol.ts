// Reproduces the frontend pay-with-sol flow end-to-end against a running
// gateway. Uses an ephemeral buyer keypair — the gateway check fires on tx
// shape so we don't need an on-chain balance to surface a rejection reason.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const PROJECT = path.join(__dirname, '..');
const IDL_PATH = path.join(PROJECT, 'target/idl/exchange.json');
const RPC = 'https://api.devnet.solana.com';
const GATEWAY = 'http://localhost:4001';

const USDC_MINT = new PublicKey('HaSyCU2nb7ffrfepbDccqB2Q2oGin9V9YkFjjAcdpQXd');
const EXCHANGE_AUTHORITY = new PublicKey('GdJjiGsy2Q1khUeEVNgySeS2DM56n28qR4jQgFyXzCo6');
const TREASURY_ATA = new PublicKey('9NeKXD4qwuWMcG4zp8tfEjKjAGu3UyoeKcbgS1kgdjyT');

async function main() {
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));
  const programId = new PublicKey(idl.address);
  const connection = new Connection(RPC, 'confirmed');

  // Find a listing to target.
  const stub = Keypair.generate();
  const provider = new anchor.AnchorProvider(
    connection,
    { publicKey: stub.publicKey, signTransaction: async (t: any) => t, signAllTransactions: async (t: any) => t } as any,
    { commitment: 'confirmed' }
  );
  const program = new anchor.Program(idl, provider);
  const listings: any[] = await (program.account as any).dataListing.all();
  if (!listings.length) throw new Error('no listings on-chain');
  const target = listings[0];
  console.log('target listing:', target.publicKey.toBase58(), '—', target.account.title);
  console.log('provider      :', target.account.provider.toBase58());

  const months = 1;
  const totalUsdc = BigInt(target.account.priceSubscriptionMonthly.toString()) * BigInt(months);
  const solPriceUsd = 150;
  const lamports = BigInt(Math.ceil((Number(totalUsdc) * 1_000) / solPriceUsd * 1.01));
  console.log(`expected: ${totalUsdc} USDC micro · ${lamports} lamports`);

  const buyer = Keypair.generate();
  console.log('buyer (ephemeral):', buyer.publicKey.toBase58());

  const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, buyer.publicKey);
  const providerAta = getAssociatedTokenAddressSync(USDC_MINT, target.account.provider);

  const [subscriptionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('subscription'), target.publicKey.toBuffer(), buyer.publicKey.toBuffer()],
    programId
  );
  const [exchangePda] = PublicKey.findProgramAddressSync([Buffer.from('data_exchange')], programId);
  const [providerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), target.account.provider.toBuffer()],
    programId
  );

  const ixs: TransactionInstruction[] = [];
  // Mimic Phantom — prepend compute-budget ixs to exercise the gateway skip.
  ixs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  ixs.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }));
  ixs.push(createAssociatedTokenAccountInstruction(buyer.publicKey, buyerAta, buyer.publicKey, USDC_MINT));
  ixs.push(
    SystemProgram.transfer({
      fromPubkey: buyer.publicKey,
      toPubkey: EXCHANGE_AUTHORITY,
      lamports: Number(lamports),
    })
  );
  ixs.push(createMintToInstruction(USDC_MINT, buyerAta, EXCHANGE_AUTHORITY, Number(totalUsdc)));

  // Wallet-adapter wrapper for anchor — plugs the ephemeral buyer as signer.
  const buyerWallet = {
    publicKey: buyer.publicKey,
    signTransaction: async (t: Transaction) => { t.partialSign(buyer); return t; },
    signAllTransactions: async (ts: Transaction[]) => { for (const t of ts) t.partialSign(buyer); return ts; },
  } as any;
  const providerWithBuyer = new anchor.AnchorProvider(connection, buyerWallet, { commitment: 'confirmed' });
  const progAsBuyer = new anchor.Program(idl, providerWithBuyer);

  const subIx: TransactionInstruction = await (progAsBuyer.methods as any)
    .subscribe(months)
    .accountsPartial({
      exchange: exchangePda,
      listing: target.publicKey,
      subscription: subscriptionPda,
      buyerUsdc: buyerAta,
      providerUsdc: providerAta,
      treasuryUsdc: TREASURY_ATA,
      provider: providerPda,
      buyer: buyer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  ixs.push(subIx);

  const tx = new Transaction().add(...ixs);
  tx.feePayer = buyer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // Partial-sign with buyer only. Serialize without demanding all sigs.
  tx.partialSign(buyer);
  const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

  console.log('\nPOST /v1/pay-with-sol');
  const r = await fetch(`${GATEWAY}/v1/pay-with-sol`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      serializedTx: serialized,
      listing: target.publicKey.toBase58(),
      buyer: buyer.publicKey.toBase58(),
      durationMonths: months,
      solLamports: lamports.toString(),
      solPriceUsd,
      slippageBps: 100,
    }),
  });
  const body = await r.text();
  console.log('HTTP', r.status);
  console.log('body:', body);
}

main().catch((err) => {
  console.error('repro failed:', err);
  process.exit(1);
});
