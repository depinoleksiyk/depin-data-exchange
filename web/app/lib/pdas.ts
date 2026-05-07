import { PublicKey } from '@solana/web3.js';
import {
  PROGRAM_ID,
  EXCHANGE_SEED,
  LISTING_SEED,
  PROVIDER_SEED,
  STAKE_VAULT_SEED,
  SUBSCRIPTION_SEED,
} from './constants';

const enc = new TextEncoder();
const seed = (s: string) => enc.encode(s);

export function exchangePda(): PublicKey {
  return PublicKey.findProgramAddressSync([seed(EXCHANGE_SEED)], PROGRAM_ID)[0];
}

export function providerPda(wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([seed(PROVIDER_SEED), wallet.toBytes()], PROGRAM_ID)[0];
}

export function stakeVaultPda(wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([seed(STAKE_VAULT_SEED), wallet.toBytes()], PROGRAM_ID)[0];
}

export function listingPda(providerWallet: PublicKey, listingId: bigint | number): PublicKey {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(listingId), true);
  return PublicKey.findProgramAddressSync([seed(LISTING_SEED), providerWallet.toBytes(), buf], PROGRAM_ID)[0];
}

export function subscriptionPda(listing: PublicKey, buyer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [seed(SUBSCRIPTION_SEED), listing.toBytes(), buyer.toBytes()],
    PROGRAM_ID
  )[0];
}
