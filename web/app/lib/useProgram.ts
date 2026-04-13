import { useMemo } from 'react';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair } from '@solana/web3.js';
import idl from '../idl.json';
import { PROGRAM_ID, EXCHANGE_SEED, LISTING_SEED, PROVIDER_SEED } from './constants';

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as any, provider);
  }, [provider]);

  return { program, provider, connection };
}

export function useReadonlyProgram() {
  const { connection } = useConnection();

  const program = useMemo(() => {
    const dummyKp = Keypair.generate();
    const dummyWallet = {
      publicKey: dummyKp.publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
    return new Program(idl as any, provider);
  }, [connection]);

  return { program, connection };
}

export function getExchangePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([toBytes(EXCHANGE_SEED)], PROGRAM_ID);
  return pda;
}

export function getProviderPDA(wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [toBytes(PROVIDER_SEED), wallet.toBytes()],
    PROGRAM_ID
  );
  return pda;
}

export function getListingPDA(provider: PublicKey, listingId: number): PublicKey {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(listingId), true);
  const [pda] = PublicKey.findProgramAddressSync(
    [toBytes(LISTING_SEED), provider.toBytes(), buf],
    PROGRAM_ID
  );
  return pda;
}
