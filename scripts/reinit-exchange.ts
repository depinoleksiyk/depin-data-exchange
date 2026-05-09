// Creates (or re-creates) the v2 DataExchange account with the new args
// struct. Also creates a USDC mint + treasury ATA. Requires the legacy
// DataExchange PDA to be closed first (see migrate-v2.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';

const PROJECT_ROOT = path.join(__dirname, '..');
const IDL_PATH = path.join(PROJECT_ROOT, 'target/idl/exchange.json');
const WALLET_PATH = path.join(PROJECT_ROOT, 'deploy-keypair.json');
const ORACLE_PATH = path.join(PROJECT_ROOT, 'oracle-keypair.json');
const USDC_MINT_PATH = path.join(PROJECT_ROOT, 'usdc-mint.json'); // persisted across runs
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
}

async function main() {
  if (!fs.existsSync(ORACLE_PATH)) {
    console.error('oracle-keypair.json missing — run `npm run oracle:key` first');
    process.exit(1);
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  const authority = loadKeypair(WALLET_PATH);
  const oracle = loadKeypair(ORACLE_PATH);
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));
  const program = new anchor.Program(idl, provider);
  const programId = new PublicKey(idl.address);

  console.log('authority:', authority.publicKey.toBase58());
  console.log('oracle:   ', oracle.publicKey.toBase58());
  console.log('balance:  ', (await connection.getBalance(authority.publicKey)) / 1e9, 'SOL');

  // 1. mock USDC mint (persisted across runs)
  let usdcMint: PublicKey;
  if (fs.existsSync(USDC_MINT_PATH)) {
    usdcMint = new PublicKey(fs.readFileSync(USDC_MINT_PATH, 'utf8').trim());
    console.log('reusing USDC mint:', usdcMint.toBase58());
  } else {
    usdcMint = await createMint(connection, authority, authority.publicKey, null, 6);
    fs.writeFileSync(USDC_MINT_PATH, usdcMint.toBase58());
    console.log('created USDC mint:', usdcMint.toBase58());
  }

  // 2. treasury ATA owned by authority
  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    usdcMint,
    authority.publicKey
  );
  console.log('treasury ata:', treasuryAta.address.toBase58());
  await mintTo(connection, authority, usdcMint, treasuryAta.address, authority, 1_000_000_000_000);

  // 3. initialize exchange
  const [exchangePDA] = PublicKey.findProgramAddressSync([Buffer.from('data_exchange')], programId);
  const exchangeAccount = await connection.getAccountInfo(exchangePDA);
  if (exchangeAccount) {
    console.log('Exchange already initialized, skipping');
    return;
  }

  const args = {
    commissionBps: 250,                        // 2.5%
    slashThreshold: 30,                        // quality < 30 → slash eligible
    slashGracePeriod: new anchor.BN(7 * 24 * 3600), // 7 days below threshold
    minStakeLamports: new anchor.BN(100_000_000),   // 0.1 SOL
  };

  const tx = await (program.methods as any)
    .initialize(args)
    .accountsPartial({
      exchange: exchangePDA,
      usdcMint,
      qualityOracle: oracle.publicKey,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log('initialize tx:', tx);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
