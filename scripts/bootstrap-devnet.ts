/*
 * bootstrap-devnet.ts — seeds the DePIN data-exchange program on devnet:
 *   mock-USDC mint → exchange config → provider registration → 3 demo listings.
 *
 * Run once per fresh deploy. Idempotent: every step checks existence before
 * sending a tx. Funds flow from ../deploy-keypair.json (authority + provider).
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const COMMISSION_BPS = 250; // 2.5%

type DemoListing = {
  id: number;
  dataType: { gps: {} } | { weather: {} } | { network: {} };
  title: string;
  description: string;
  pricePerQuery: number;
  subscriptionPrice: number;
};

const DEMO_LISTINGS: DemoListing[] = [
  { id: 1, dataType: { gps: {} },     title: 'NYC GPS Fleet Data',       description: 'Real-time GPS from 500+ delivery vehicles',   pricePerQuery: 2000, subscriptionPrice: 5_000_000 },
  { id: 2, dataType: { weather: {} }, title: 'Berlin Weather Stations',  description: 'Temperature, humidity from 23 IoT stations',  pricePerQuery: 1000, subscriptionPrice: 3_000_000 },
  { id: 3, dataType: { network: {} }, title: 'Helium Hotspot Network',   description: 'Coverage maps and uptime from 15K+ hotspots', pricePerQuery: 3000, subscriptionPrice: 8_000_000 },
];

const log = {
  step: (n: number, msg: string) => console.log(`[step ${n}] ${msg}`),
  ok:   (msg: string)            => console.log(`  ✓ ${msg}`),
  skip: (msg: string)            => console.log(`  · ${msg} (skipped, already on-chain)`),
  err:  (where: string, e: unknown) => console.error(`  ✗ ${where}: ${String(e).slice(0, 180)}`),
};

function loadAuthority(keypairPath: string): Keypair {
  const secretJson = JSON.parse(readFileSync(keypairPath, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secretJson));
}

async function isAccountInitialized(conn: Connection, pda: PublicKey): Promise<boolean> {
  return (await conn.getAccountInfo(pda)) !== null;
}

async function sendIfMissing<T>(
  label: string,
  pda: PublicKey,
  conn: Connection,
  build: () => Promise<T>,
): Promise<T | undefined> {
  if (await isAccountInitialized(conn, pda)) {
    log.skip(label);
    return;
  }
  try {
    const res = await build();
    log.ok(label);
    return res;
  } catch (e) {
    if (String(e).includes('already in use')) { log.skip(label); return; }
    log.err(label, e);
    return;
  }
}

async function bootstrap(): Promise<void> {
  const conn = new Connection(DEVNET_RPC, 'confirmed');
  const authority = loadAuthority(resolvePath(__dirname, '../deploy-keypair.json'));

  const idlPath = resolvePath(__dirname, '../target/idl/exchange.json');
  const IDL = JSON.parse(readFileSync(idlPath, 'utf8'));
  const PROGRAM_ID = new PublicKey(IDL.address);

  const lamports = await conn.getBalance(authority.publicKey);
  console.log(`· authority   ${authority.publicKey.toBase58()}`);
  console.log(`· funding     ${(lamports / 1e9).toFixed(4)} SOL available on devnet`);
  console.log(`· program     ${PROGRAM_ID.toBase58()}`);

  const provider = new anchor.AnchorProvider(
    conn,
    new anchor.Wallet(authority),
    { commitment: 'confirmed' },
  );
  const program = new anchor.Program(IDL, provider);

  log.step(1, 'minting mock USDC (6 decimals)');
  let usdcMint: PublicKey;
  try {
    usdcMint = await createMint(conn, authority, authority.publicKey, null, 6);
    log.ok(`mint = ${usdcMint.toBase58()}`);
  } catch (e) {
    log.err('createMint', e);
    return;
  }

  log.step(2, 'preparing treasury ATA');
  const treasuryAta = await getOrCreateAssociatedTokenAccount(conn, authority, usdcMint, authority.publicKey);
  log.ok(`ata = ${treasuryAta.address.toBase58()}`);

  log.step(3, 'initializing exchange PDA');
  const [exchangePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('data_exchange')],
    PROGRAM_ID,
  );
  await sendIfMissing(`exchange ${exchangePda.toBase58()}`, exchangePda, conn, () =>
    (program.methods as any)
      .initialize(COMMISSION_BPS)
      .accountsPartial({
        exchange: exchangePda,
        authority: authority.publicKey,
        treasury: authority.publicKey,
        usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  log.step(4, 'registering provider');
  const [providerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), authority.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  await sendIfMissing('provider "DePIN Demo Provider"', providerPda, conn, () =>
    (program.methods as any)
      .registerProvider('DePIN Demo Provider')
      .accountsPartial({
        exchange: exchangePda,
        provider: providerPda,
        wallet: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );

  log.step(5, `seeding ${DEMO_LISTINGS.length} demo listings`);
  for (const listing of DEMO_LISTINGS) {
    const [listingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('listing'),
        authority.publicKey.toBuffer(),
        new anchor.BN(listing.id).toArrayLike(Buffer, 'le', 8),
      ],
      PROGRAM_ID,
    );
    await sendIfMissing(`listing #${listing.id} — ${listing.title}`, listingPda, conn, () =>
      (program.methods as any)
        .createListing(
          new anchor.BN(listing.id),
          listing.dataType,
          listing.title,
          listing.description,
          new anchor.BN(listing.pricePerQuery),
          new anchor.BN(listing.subscriptionPrice),
        )
        .accountsPartial({
          exchange: exchangePda,
          listing: listingPda,
          provider: providerPda,
          wallet: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
    );
  }

  console.log('\n done — exchange, provider, listings ready on devnet');
}

bootstrap().catch((e) => {
  console.error('bootstrap failed:', e);
  process.exit(1);
});
