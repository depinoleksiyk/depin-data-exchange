// Walks every account owned by the v2 program and calls the corresponding
// close_legacy_* instruction so the PDAs become free. Only accounts whose
// first-pubkey-field matches the local deploy keypair can be closed here —
// user-owned listings / providers must be closed from their own wallets.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';

const PROJECT_ROOT = path.join(__dirname, '..');
const IDL_PATH = path.join(PROJECT_ROOT, 'target/idl/exchange.json');
const WALLET_PATH = path.join(PROJECT_ROOT, 'deploy-keypair.json');
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';

function loadIdl(): any {
  return JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));
}

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
}

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const authority = loadKeypair(WALLET_PATH);
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idl = loadIdl();
  const program = new anchor.Program(idl, provider);
  const programId = new PublicKey(idl.address);

  console.log('authority:', authority.publicKey.toBase58());
  console.log('program:  ', programId.toBase58());
  console.log('rpc:      ', RPC_URL);

  const accounts = await connection.getProgramAccounts(programId, { commitment: 'confirmed' });
  console.log(`scanning ${accounts.length} program accounts…`);

  // group accounts by shape using the first pubkey at offset 8
  const byOwner: Record<string, Array<{ pubkey: PublicKey; bytes: Buffer }>> = {};
  for (const { pubkey, account } of accounts) {
    const data = Buffer.from(account.data);
    if (data.length < 40) continue;
    const owner = new PublicKey(data.subarray(8, 40)).toBase58();
    byOwner[owner] = byOwner[owner] || [];
    byOwner[owner].push({ pubkey, bytes: data });
  }

  const ours = byOwner[authority.publicKey.toBase58()] || [];
  console.log(`${ours.length} accounts belong to the deploy keypair, attempting to close…`);

  const [exchangePDA] = PublicKey.findProgramAddressSync([Buffer.from('data_exchange')], programId);
  const [providerPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), authority.publicKey.toBuffer()],
    programId
  );

  // 1. close legacy listings (need listing_id from bytes 40..48)
  for (const row of ours) {
    if (row.pubkey.equals(exchangePDA) || row.pubkey.equals(providerPDA)) continue;
    const listingId = row.bytes.readBigUInt64LE(40);
    console.log(`→ close legacy listing ${row.pubkey.toBase58().slice(0, 10)}… id=${listingId}`);
    try {
      const tx = await (program.methods as any)
        .closeLegacyListing(new anchor.BN(listingId.toString()))
        .accountsPartial({
          legacy: row.pubkey,
          providerWallet: authority.publicKey,
        })
        .rpc();
      console.log('   ok:', tx.slice(0, 16));
    } catch (err: any) {
      console.warn('   skipped:', String(err?.message || err).slice(0, 140));
    }
  }

  // 2. close legacy provider
  const providerAcct = await connection.getAccountInfo(providerPDA);
  if (providerAcct) {
    console.log(`→ close legacy provider ${providerPDA.toBase58()}`);
    try {
      const tx = await (program.methods as any)
        .closeLegacyProvider()
        .accountsPartial({ legacy: providerPDA, wallet: authority.publicKey })
        .rpc();
      console.log('   ok:', tx.slice(0, 16));
    } catch (err: any) {
      console.warn('   skipped:', String(err?.message || err).slice(0, 140));
    }
  }

  // 3. close legacy exchange (last, so other state accounts can still
  //    reference the exchange during their close path if needed)
  const exchangeAcct = await connection.getAccountInfo(exchangePDA);
  if (exchangeAcct) {
    console.log(`→ close legacy exchange ${exchangePDA.toBase58()}`);
    try {
      const tx = await (program.methods as any)
        .closeLegacyExchange()
        .accountsPartial({ legacy: exchangePDA, authority: authority.publicKey })
        .rpc();
      console.log('   ok:', tx.slice(0, 16));
    } catch (err: any) {
      console.warn('   skipped:', String(err?.message || err).slice(0, 140));
    }
  }

  // 4. leftover accounts owned by other wallets — log so the user knows
  const orphans = Object.entries(byOwner).filter(([k]) => k !== authority.publicKey.toBase58());
  if (orphans.length > 0) {
    console.log('\nOrphan PDAs (owned by other wallets, left untouched):');
    for (const [owner, items] of orphans) {
      console.log(`  ${owner}: ${items.length} account(s)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
