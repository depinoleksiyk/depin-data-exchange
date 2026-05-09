import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import idl from '../idl.json';
import { PROGRAM_ID } from './constants';

type AnchorWallet = {
  publicKey: PublicKey;
  signTransaction: <T>(tx: T) => Promise<T>;
  signAllTransactions: <T>(txs: T[]) => Promise<T[]>;
};

let cachedReadOnly: Program | null = null;

export function marketplaceClient(connection: Connection, wallet?: AnchorWallet): Program {
  if (wallet) {
    const prov = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    return new Program(idl as any, prov);
  }
  if (cachedReadOnly) return cachedReadOnly;
  const stub = Keypair.generate();
  const prov = new AnchorProvider(
    connection,
    {
      publicKey: stub.publicKey,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    } as any,
    { commitment: 'confirmed' }
  );
  cachedReadOnly = new Program(idl as any, prov);
  return cachedReadOnly;
}

export { PROGRAM_ID };
