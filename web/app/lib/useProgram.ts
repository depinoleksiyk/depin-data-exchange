import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import idl from '../idl.json';
import { PROGRAM_ID } from './constants';

type AnchorWallet = {
  publicKey: PublicKey;
  signTransaction: <T>(tx: T) => Promise<T>;
  signAllTransactions: <T>(txs: T[]) => Promise<T[]>;
};

// Keyed by RPC endpoint so switching networks (e.g. devnet → mainnet via
// wallet change) doesn't reuse a program bound to the old connection.
const readOnlyCache = new Map<string, Program>();

export function marketplaceClient(connection: Connection, wallet?: AnchorWallet): Program {
  if (wallet) {
    const prov = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    return new Program(idl as any, prov);
  }
  const endpoint = connection.rpcEndpoint;
  const cached = readOnlyCache.get(endpoint);
  if (cached) return cached;
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
  const program = new Program(idl as any, prov);
  readOnlyCache.set(endpoint, program);
  return program;
}

export { PROGRAM_ID };
