// Workaround for the provider == treasury collision on the seeded demo:
// because the deploy keypair is both exchange authority AND the seeded
// provider, its USDC ATA ends up in the subscribe instruction twice,
// which Anchor rejects as ConstraintDuplicateMutableAccount (2040).
//
// Rather than redeploy the program (devnet faucet rate-limited), we
// register a *separate* provider wallet. Old deploy-owned listings are
// closed via close_legacy_listing (the helper tolerates v2 layout because
// the provider pubkey still lives at offset 8).
//
// Safe to re-run — fresh-provider keypair is cached on disk, legacy close
// calls are no-ops once the accounts are gone.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  mintTo,
} from '@solana/spl-token';
import { keccak256 } from 'js-sha3';

const PROJECT_ROOT = path.join(__dirname, '..');
const IDL_PATH = path.join(PROJECT_ROOT, 'target/idl/exchange.json');
const DEPLOY_WALLET = path.join(PROJECT_ROOT, 'deploy-keypair.json');
const PROVIDER_WALLET = path.join(PROJECT_ROOT, 'provider-keypair.json');
const USDC_MINT_PATH = path.join(PROJECT_ROOT, 'usdc-mint.json');
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';

const LISTINGS = [
  { type: 'gps',     title: 'NYC Fleet GPS',           desc: '500+ delivery vehicles, 1Hz telemetry across Manhattan & Brooklyn',         ppq:  2_000, sub:  5_000_000 },
  { type: 'gps',     title: 'EU Freight Corridors',    desc: 'Container positions from 200+ freight trucks across western Europe',         ppq:  4_000, sub: 10_000_000 },
  { type: 'weather', title: 'Berlin Wx Network',       desc: '23 DIY IoT weather stations — temp, humidity, pressure, wind, 30s cadence', ppq:  1_000, sub:  3_000_000 },
  { type: 'weather', title: 'Tokyo Air Quality',       desc: 'PM2.5 + PM10 + NO2 from 40 city-grade monitoring stations',                   ppq:  2_000, sub:  4_000_000 },
  { type: 'network', title: 'Helium Coverage Pulse',   desc: 'Uptime, latency, peer counts from 15K+ hotspots worldwide',                  ppq:  3_000, sub:  8_000_000 },
  { type: 'camera',  title: 'Hivemapper Dashcam Feed', desc: 'Geo-tagged 4K road imagery from 120 active contributors',                    ppq:  5_000, sub: 12_000_000 },
];

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
}

function ensureProviderKeypair(): Keypair {
  if (fs.existsSync(PROVIDER_WALLET)) return loadKeypair(PROVIDER_WALLET);
  const kp = Keypair.generate();
  fs.writeFileSync(PROVIDER_WALLET, JSON.stringify(Array.from(kp.secretKey)));
  fs.chmodSync(PROVIDER_WALLET, 0o600);
  console.log('provider keypair generated:', kp.publicKey.toBase58());
  return kp;
}

function variantFor(type: string) {
  switch (type) {
    case 'gps':     return { gps: {} };
    case 'weather': return { weather: {} };
    case 'network': return { network: {} };
    case 'camera':  return { camera: {} };
    default:        return { gps: {} };
  }
}

function snapshotRoot(seed: string): Buffer {
  return Buffer.from(keccak256.arrayBuffer(Buffer.from(`depin-root:${seed}`)));
}

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const deploy = loadKeypair(DEPLOY_WALLET);
  const provider = ensureProviderKeypair();

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));
  const programId = new PublicKey(idl.address);

  const deployWallet = new anchor.Wallet(deploy);
  const deployProvider = new anchor.AnchorProvider(connection, deployWallet, { commitment: 'confirmed' });
  const programAsDeploy = new anchor.Program(idl, deployProvider);

  const providerWallet = new anchor.Wallet(provider);
  const providerProvider = new anchor.AnchorProvider(connection, providerWallet, { commitment: 'confirmed' });
  const programAsProvider = new anchor.Program(idl, providerProvider);

  console.log('deploy  :', deploy.publicKey.toBase58());
  console.log('provider:', provider.publicKey.toBase58());
  console.log('deploy balance :', (await connection.getBalance(deploy.publicKey)) / LAMPORTS_PER_SOL, 'SOL');
  console.log('prov  balance  :', (await connection.getBalance(provider.publicKey)) / LAMPORTS_PER_SOL, 'SOL');

  const [exchangePDA] = PublicKey.findProgramAddressSync([Buffer.from('data_exchange')], programId);

  // 1. Close deploy-keypair-owned listings (the ones we seeded earlier). Their
  //    account layout is v2, but the close_legacy_listing helper verifies the
  //    signer against bytes 8..40 (the provider field), which is the same for
  //    both v1 and v2 layouts.
  const accounts = await connection.getProgramAccounts(programId, { commitment: 'confirmed' });
  const legacyListings = [];
  const DISCRIMINATOR_LISTING = /^.{8}/; // we'll decode the provider directly
  for (const { pubkey, account } of accounts) {
    const data = Buffer.from(account.data);
    if (data.length < 48) continue;
    const maybeProvider = new PublicKey(data.subarray(8, 40));
    if (!maybeProvider.equals(deploy.publicKey)) continue;
    // listing_id sits at offset 40 (u64 LE) for listings; exchange + provider
    // don't have one at that position, but their byte layouts differ enough
    // that close_legacy_listing will just fail on those via seed mismatch.
    const listingId = data.readBigUInt64LE(40);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from('listing'), deploy.publicKey.toBuffer(), Buffer.from(new anchor.BN(listingId.toString()).toArrayLike(Buffer, 'le', 8))],
      programId
    );
    if (expected.equals(pubkey)) legacyListings.push({ pubkey, listingId });
  }
  console.log(`found ${legacyListings.length} deploy-owned listings to retire`);

  for (const { pubkey, listingId } of legacyListings) {
    try {
      const tx = await (programAsDeploy.methods as any)
        .closeLegacyListing(new anchor.BN(listingId.toString()))
        .accountsPartial({ legacy: pubkey, providerWallet: deploy.publicKey })
        .rpc();
      console.log(`  closed ${pubkey.toBase58().slice(0, 10)} id=${listingId} tx=${tx.slice(0, 12)}`);
    } catch (err: any) {
      console.warn(`  skip   ${pubkey.toBase58().slice(0, 10)}: ${String(err?.message || err).slice(0, 120)}`);
    }
  }

  // 2. Close the deploy-owned provider + stake vault so the next register from
  //    a different wallet doesn't conflict. Seeds are keyed on wallet, so the
  //    deploy-owned PDAs live at different addresses than the new-provider
  //    ones — this is purely rent reclaim.
  const [deployProviderPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), deploy.publicKey.toBuffer()],
    programId
  );
  const deployProviderInfo = await connection.getAccountInfo(deployProviderPDA);
  if (deployProviderInfo) {
    try {
      const tx = await (programAsDeploy.methods as any)
        .closeLegacyProvider()
        .accountsPartial({ legacy: deployProviderPDA, wallet: deploy.publicKey })
        .rpc();
      console.log('closed deploy provider PDA tx=', tx.slice(0, 12));
    } catch (err: any) {
      console.warn('deploy provider close skipped:', String(err?.message || err).slice(0, 120));
    }
  }

  // 3. Fund the new provider — 0.2 SOL covers 0.15 SOL stake + rent for
  //    register + six create_listing + six commit_snapshot calls.
  const provBalance = await connection.getBalance(provider.publicKey);
  if (provBalance < 0.2 * LAMPORTS_PER_SOL) {
    const topUp = Math.floor(0.2 * LAMPORTS_PER_SOL) - provBalance;
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction({ feePayer: deploy.publicKey, recentBlockhash: blockhash }).add(
      SystemProgram.transfer({
        fromPubkey: deploy.publicKey,
        toPubkey: provider.publicKey,
        lamports: topUp,
      })
    );
    tx.sign(deploy);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`funded provider with ${(topUp / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  }

  // 4. Create the provider's USDC ATA (paid by deploy keypair, since the
  //    provider keypair only holds SOL; mint authority is the deploy keypair
  //    too so it mints some USDC into that ATA for receiving payouts tests).
  const usdcMint = new PublicKey(fs.readFileSync(USDC_MINT_PATH, 'utf8').trim());
  const providerAta = getAssociatedTokenAddressSync(usdcMint, provider.publicKey);
  const ataInfo = await connection.getAccountInfo(providerAta);
  if (!ataInfo) {
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction({ feePayer: deploy.publicKey, recentBlockhash: blockhash }).add(
      createAssociatedTokenAccountInstruction(deploy.publicKey, providerAta, provider.publicKey, usdcMint)
    );
    tx.sign(deploy);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('provider USDC ATA:', providerAta.toBase58(), 'tx=', sig.slice(0, 12));
  }

  // 5. Register the new provider
  const [newProviderPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), provider.publicKey.toBuffer()],
    programId
  );
  const [newStakeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake_vault'), provider.publicKey.toBuffer()],
    programId
  );
  const newProviderInfo = await connection.getAccountInfo(newProviderPDA);
  if (!newProviderInfo) {
    const tx = await (programAsProvider.methods as any)
      .registerProvider('Fleet Labs DePIN')
      .accountsPartial({
        provider: newProviderPDA,
        stakeVault: newStakeVault,
        wallet: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('register_provider tx=', tx.slice(0, 12));
  }

  // 6. Stake 0.15 SOL with a 24h lock
  try {
    const tx = await (programAsProvider.methods as any)
      .stakeProvider(new anchor.BN(0.15 * LAMPORTS_PER_SOL), new anchor.BN(24 * 3600))
      .accountsPartial({
        provider: newProviderPDA,
        stakeVault: newStakeVault,
        providerWallet: provider.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('stake_provider tx=', tx.slice(0, 12));
  } catch (err: any) {
    console.warn('stake skipped:', String(err?.message || err).slice(0, 120));
  }

  // 7. Publish listings and commit deterministic snapshot roots
  const providerData = await (programAsProvider.account as any).dataProvider.fetch(newProviderPDA);
  let nextId = BigInt(providerData.nextListingId.toString());

  for (const spec of LISTINGS) {
    const listingId = nextId;
    nextId += 1n;

    const [listingPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('listing'), provider.publicKey.toBuffer(), Buffer.from(new anchor.BN(listingId.toString()).toArrayLike(Buffer, 'le', 8))],
      programId
    );

    if (await connection.getAccountInfo(listingPDA)) {
      console.log(`  listing #${listingId} already exists`);
      continue;
    }

    const args = {
      dataType: variantFor(spec.type),
      title: spec.title,
      description: spec.desc,
      pricePerQuery: new anchor.BN(spec.ppq),
      priceSubscriptionMonthly: new anchor.BN(spec.sub),
    };

    try {
      const tx = await (programAsProvider.methods as any)
        .createListing(args)
        .accountsPartial({
          exchange: exchangePDA,
          provider: newProviderPDA,
          listing: listingPDA,
          providerWallet: provider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`  ${spec.title.padEnd(28)} id=${listingId} tx=${tx.slice(0, 12)}`);
    } catch (err: any) {
      console.error(`  failed ${spec.title}:`, String(err?.message || err).slice(0, 160));
      continue;
    }

    const root = snapshotRoot(`${spec.type}-${listingId}`);
    try {
      const tx = await (programAsProvider.methods as any)
        .commitSnapshot(Array.from(root))
        .accountsPartial({
          listing: listingPDA,
          providerWallet: provider.publicKey,
        })
        .rpc();
      console.log(`    snapshot root=${root.toString('hex').slice(0, 12)}… tx=${tx.slice(0, 10)}`);
    } catch (err: any) {
      console.warn(`    snapshot skipped: ${String(err?.message || err).slice(0, 120)}`);
    }
  }

  const final = await (programAsProvider.account as any).dataProvider.fetch(newProviderPDA);
  console.log(`\nreseed complete — Fleet Labs DePIN now owns ${final.totalListings} listing(s)`);
  console.log(`deploy   ending balance: ${((await connection.getBalance(deploy.publicKey)) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`provider ending balance: ${((await connection.getBalance(provider.publicKey)) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
