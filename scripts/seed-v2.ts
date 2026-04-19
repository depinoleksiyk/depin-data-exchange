// Seeds the deploy keypair as a provider, stakes the minimum stake, and
// creates six listings (two per non-camera data type). Each listing gets a
// keccak Merkle root committed via commit_snapshot so gateway proofs work
// end-to-end out of the box.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { keccak256 } from 'js-sha3';

const PROJECT_ROOT = path.join(__dirname, '..');
const IDL_PATH = path.join(PROJECT_ROOT, 'target/idl/exchange.json');
const WALLET_PATH = path.join(PROJECT_ROOT, 'deploy-keypair.json');
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';

const LISTINGS = [
  { type: 'gps',     title: 'NYC Fleet GPS',           desc: '500+ delivery vehicles, 1Hz telemetry across Manhattan & Brooklyn',          ppq:  2_000, sub:  5_000_000 },
  { type: 'gps',     title: 'EU Freight Corridors',    desc: 'Container positions from 200+ freight trucks across western Europe',          ppq:  4_000, sub: 10_000_000 },
  { type: 'weather', title: 'Berlin Wx Network',       desc: '23 DIY IoT weather stations — temp, humidity, pressure, wind, 30s cadence',  ppq:  1_000, sub:  3_000_000 },
  { type: 'weather', title: 'Tokyo Air Quality',       desc: 'PM2.5 + PM10 + NO2 from 40 city-grade monitoring stations',                    ppq:  2_000, sub:  4_000_000 },
  { type: 'network', title: 'Helium Coverage Pulse',   desc: 'Uptime, latency, peer counts from 15K+ hotspots worldwide',                   ppq:  3_000, sub:  8_000_000 },
  { type: 'camera',  title: 'Hivemapper Dashcam Feed', desc: 'Geo-tagged 4K road imagery from 120 active contributors',                     ppq:  5_000, sub: 12_000_000 },
];

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
}

function fakeMerkleRoot(seed: string): Buffer {
  // Deterministic per-listing root so gateway proofs reproduce it.
  return Buffer.from(keccak256.arrayBuffer(Buffer.from(`depin-root:${seed}`)));
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

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const authority = loadKeypair(WALLET_PATH);
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));
  const program = new anchor.Program(idl, provider);
  const programId = new PublicKey(idl.address);

  const [exchangePDA] = PublicKey.findProgramAddressSync([Buffer.from('data_exchange')], programId);
  const [providerPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), authority.publicKey.toBuffer()],
    programId
  );
  const [stakeVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('stake_vault'), authority.publicKey.toBuffer()],
    programId
  );

  console.log('authority:', authority.publicKey.toBase58());
  console.log('exchange: ', exchangePDA.toBase58());
  console.log('provider: ', providerPDA.toBase58());
  console.log('vault:    ', stakeVaultPDA.toBase58());

  // 1. register provider (skip if already registered)
  const providerAcct = await connection.getAccountInfo(providerPDA);
  if (providerAcct) {
    console.log('provider already registered');
  } else {
    const tx = await (program.methods as any)
      .registerProvider('DePIN Reference Provider')
      .accountsPartial({
        provider: providerPDA,
        stakeVault: stakeVaultPDA,
        wallet: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('register_provider tx:', tx);
  }

  // 2. stake enough lamports to satisfy min_stake_lamports (0.1 SOL) plus
  //    extra headroom so slashing has material to work with.
  const stakeAmount = new anchor.BN(0.15 * LAMPORTS_PER_SOL);
  const lockDuration = new anchor.BN(24 * 3600); // 1 day lock
  try {
    const tx = await (program.methods as any)
      .stakeProvider(stakeAmount, lockDuration)
      .accountsPartial({
        provider: providerPDA,
        stakeVault: stakeVaultPDA,
        providerWallet: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('stake_provider tx:', tx);
  } catch (err: any) {
    console.warn('stake skipped:', String(err?.message || err).slice(0, 140));
  }

  // 3. create listings + commit snapshots
  const providerData = await (program.account as any).dataProvider.fetch(providerPDA);
  let nextId = BigInt(providerData.nextListingId.toString());

  for (const spec of LISTINGS) {
    const listingId = nextId;
    nextId += 1n;

    const [listingPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('listing'), authority.publicKey.toBuffer(), Buffer.from(new anchor.BN(listingId.toString()).toArrayLike(Buffer, 'le', 8))],
      programId
    );

    const existing = await connection.getAccountInfo(listingPDA);
    if (existing) {
      console.log(`listing ${listingPDA.toBase58().slice(0, 10)}… already exists, skipping`);
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
      const tx = await (program.methods as any)
        .createListing(args)
        .accountsPartial({
          exchange: exchangePDA,
          provider: providerPDA,
          listing: listingPDA,
          providerWallet: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`  ${spec.title.padEnd(26)} id=${listingId} tx=${tx.slice(0, 12)}`);
    } catch (err: any) {
      console.error(`  failed ${spec.title}:`, String(err?.message || err).slice(0, 160));
      continue;
    }

    // commit a deterministic snapshot root so `/v1/sample-proof` can verify
    const root = fakeMerkleRoot(`${spec.type}-${listingId}`);
    try {
      const tx = await (program.methods as any)
        .commitSnapshot(Array.from(root))
        .accountsPartial({
          listing: listingPDA,
          providerWallet: authority.publicKey,
        })
        .rpc();
      console.log(`    snapshot root=${root.toString('hex').slice(0, 12)}… tx=${tx.slice(0, 10)}`);
    } catch (err: any) {
      console.warn(`    snapshot failed:`, String(err?.message || err).slice(0, 140));
    }
  }

  const finalProvider = await (program.account as any).dataProvider.fetch(providerPDA);
  console.log(
    `\nseed complete — provider now owns ${finalProvider.totalListings} listing(s), next_listing_id=${finalProvider.nextListingId}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
