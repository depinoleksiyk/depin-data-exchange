import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, Connection, SystemProgram } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const IDL = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../target/idl/exchange.json'), 'utf8')
);
const PROGRAM_ID = new PublicKey(IDL.address);

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const walletPath = path.join(__dirname, '../deploy-keypair.json');
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
  );

  console.log('Authority:', walletKeypair.publicKey.toBase58());
  console.log('Balance:', await connection.getBalance(walletKeypair.publicKey) / 1e9, 'SOL');

  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new anchor.Program(IDL, provider);

  // 1. Create USDC mock mint
  console.log('\nCreating mock USDC mint...');
  let usdcMint: PublicKey;
  try {
    usdcMint = await createMint(connection, walletKeypair, walletKeypair.publicKey, null, 6);
    console.log('USDC mint created:', usdcMint.toBase58());
  } catch (error) {
    console.error('Mint creation failed:', String(error));
    return;
  }

  // 2. Create treasury ATA
  const treasuryAta = await getOrCreateAssociatedTokenAccount(connection, walletKeypair, usdcMint, walletKeypair.publicKey);
  console.log('Treasury ATA:', treasuryAta.address.toBase58());

  // 3. Initialize exchange
  const [exchangePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('data_exchange')],
    PROGRAM_ID
  );

  try {
    const acc = await connection.getAccountInfo(exchangePDA);
    if (acc) {
      console.log('Exchange already initialized');
    } else {
      const tx = await (program.methods as any)
        .initialize(250) // 2.5% commission
        .accountsPartial({
          exchange: exchangePDA,
          authority: walletKeypair.publicKey,
          treasury: walletKeypair.publicKey,
          usdcMint,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log('Exchange initialized:', tx);
    }
  } catch (error) {
    if (String(error).includes('already in use')) {
      console.log('Exchange already exists');
    } else {
      console.error('Init failed:', String(error).substring(0, 150));
    }
  }

  // 4. Register provider
  const [providerPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), walletKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  try {
    const acc = await connection.getAccountInfo(providerPDA);
    if (acc) {
      console.log('Provider already registered');
    } else {
      const tx = await (program.methods as any)
        .registerProvider('DePIN Demo Provider')
        .accountsPartial({
          exchange: exchangePDA,
          provider: providerPDA,
          wallet: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log('Provider registered:', tx);
    }
  } catch (error) {
    console.error('Register failed:', String(error).substring(0, 150));
  }

  // 5. Create demo listings
  const listings = [
    { id: 1, type: { gps: {} }, title: 'NYC GPS Fleet Data', desc: 'Real-time GPS from 500+ delivery vehicles', ppq: 2000, sub: 5000000 },
    { id: 2, type: { weather: {} }, title: 'Berlin Weather Stations', desc: 'Temperature, humidity from 23 IoT stations', ppq: 1000, sub: 3000000 },
    { id: 3, type: { network: {} }, title: 'Helium Hotspot Network', desc: 'Coverage maps and uptime from 15K+ hotspots', ppq: 3000, sub: 8000000 },
  ];

  for (const l of listings) {
    const [listingPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('listing'), walletKeypair.publicKey.toBuffer(), new anchor.BN(l.id).toArrayLike(Buffer, 'le', 8)],
      PROGRAM_ID
    );

    try {
      const acc = await connection.getAccountInfo(listingPDA);
      if (acc) {
        console.log(`Listing "${l.title}" already exists`);
        continue;
      }
      const tx = await (program.methods as any)
        .createListing(new anchor.BN(l.id), l.type, l.title, l.desc, new anchor.BN(l.ppq), new anchor.BN(l.sub))
        .accountsPartial({
          exchange: exchangePDA,
          listing: listingPDA,
          provider: providerPDA,
          wallet: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`Listing "${l.title}" created:`, tx);
    } catch (error) {
      console.error(`Listing "${l.title}" failed:`, String(error).substring(0, 150));
    }
  }

  console.log('\nDone! Exchange + provider + 3 listings initialized.');
}

main().catch(console.error);
