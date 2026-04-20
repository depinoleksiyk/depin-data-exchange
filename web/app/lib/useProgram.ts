import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import idl from '../idl.json';
import { PROGRAM_ID, EXCHANGE_SEED, LISTING_SEED, PROVIDER_SEED } from './constants';

let _readonlyProg: Program | null = null;

export function getMarketplace(connection: Connection, wallet?: any): Program {
  if (wallet) {
    const prov = new AnchorProvider(connection, wallet, { commitment: 'finalized' });
    return new Program(idl as any, prov);
  }
  if (_readonlyProg) return _readonlyProg;
  const anon = Keypair.generate();
  const prov = new AnchorProvider(connection, {
    publicKey: anon.publicKey,
    signTransaction: async (t: any) => t,
    signAllTransactions: async (ts: any) => ts,
  } as any, { commitment: 'finalized' });
  _readonlyProg = new Program(idl as any, prov);
  return _readonlyProg;
}

function seed(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function getExchangePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([seed(EXCHANGE_SEED)], PROGRAM_ID);
  return pda;
}

export function getProviderPDA(wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [seed(PROVIDER_SEED), wallet.toBytes()],
    PROGRAM_ID
  );
  return pda;
}

export function getListingPDA(provider: PublicKey, listingId: number): PublicKey {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(listingId), true);
  const [pda] = PublicKey.findProgramAddressSync(
    [seed(LISTING_SEED), provider.toBytes(), buf],
    PROGRAM_ID
  );
  return pda;
}
