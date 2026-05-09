import { BN, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { keccak256 } from 'js-sha3';
import {
  EXCHANGE_AUTHORITY,
  PROGRAM_ID,
  TREASURY_ATA,
  USDC_MINT,
} from './constants';
import {
  exchangePda,
  listingPda,
  providerPda,
  stakeVaultPda,
  subscriptionPda,
} from './pdas';

export type RawListing = {
  pubkey: PublicKey;
  provider: PublicKey;
  listingId: bigint;
  dataType: 'GPS' | 'Weather' | 'Network' | 'Camera';
  title: string;
  description: string;
  pricePerQuery: bigint;
  priceSubscriptionMonthly: bigint;
  totalQueries: bigint;
  totalRevenue: bigint;
  qualityScore: number;
  isActive: boolean;
  snapshotRoot: number[];
  snapshotIndex: bigint;
  snapshotUpdatedAt: number;
  qualityUpdatedAt: number;
  createdAt: number;
};

function dataTypeOf(raw: any): RawListing['dataType'] {
  if (raw?.weather !== undefined) return 'Weather';
  if (raw?.network !== undefined) return 'Network';
  if (raw?.camera !== undefined) return 'Camera';
  return 'GPS';
}

export async function fetchListings(program: Program): Promise<RawListing[]> {
  const rows = await (program.account as any).dataListing.all();
  return rows
    .map(({ publicKey, account }: any) => ({
      pubkey: publicKey,
      provider: account.provider,
      listingId: BigInt(account.listingId.toString()),
      dataType: dataTypeOf(account.dataType),
      title: account.title,
      description: account.description,
      pricePerQuery: BigInt(account.pricePerQuery.toString()),
      priceSubscriptionMonthly: BigInt(account.priceSubscriptionMonthly.toString()),
      totalQueries: BigInt(account.totalQueries.toString()),
      totalRevenue: BigInt(account.totalRevenue.toString()),
      qualityScore: account.qualityScore,
      isActive: account.isActive,
      snapshotRoot: Array.from(account.snapshotRoot),
      snapshotIndex: BigInt(account.snapshotIndex.toString()),
      snapshotUpdatedAt: Number(account.snapshotUpdatedAt),
      qualityUpdatedAt: Number(account.qualityUpdatedAt),
      createdAt: Number(account.createdAt),
    }))
    .sort((a: RawListing, b: RawListing) => b.createdAt - a.createdAt);
}

export async function fetchListing(program: Program, pubkey: PublicKey): Promise<RawListing | null> {
  try {
    const account: any = await (program.account as any).dataListing.fetch(pubkey);
    return {
      pubkey,
      provider: account.provider,
      listingId: BigInt(account.listingId.toString()),
      dataType: dataTypeOf(account.dataType),
      title: account.title,
      description: account.description,
      pricePerQuery: BigInt(account.pricePerQuery.toString()),
      priceSubscriptionMonthly: BigInt(account.priceSubscriptionMonthly.toString()),
      totalQueries: BigInt(account.totalQueries.toString()),
      totalRevenue: BigInt(account.totalRevenue.toString()),
      qualityScore: account.qualityScore,
      isActive: account.isActive,
      snapshotRoot: Array.from(account.snapshotRoot),
      snapshotIndex: BigInt(account.snapshotIndex.toString()),
      snapshotUpdatedAt: Number(account.snapshotUpdatedAt),
      qualityUpdatedAt: Number(account.qualityUpdatedAt),
      createdAt: Number(account.createdAt),
    };
  } catch {
    return null;
  }
}

export type SubscriptionView = {
  pubkey: PublicKey;
  buyer: PublicKey;
  listing: PublicKey;
  startedAt: number;
  expiresAt: number;
  queriesUsed: number;
  queriesLimit: number;
  hasRated: boolean;
  accessKeyHash: number[];
  accessKeyActive: boolean;
  accessKeyIssuedAt: number;
};

/** Returns every DataSubscription owned by this buyer. buyer pubkey sits at
 *  offset 8 (first field after the 8-byte Anchor discriminator). */
export async function fetchSubscriptionsForBuyer(
  program: Program,
  buyer: PublicKey
): Promise<SubscriptionView[]> {
  const rows = await (program.account as any).dataSubscription.all([
    { memcmp: { offset: 8, bytes: buyer.toBase58() } },
  ]);
  return rows.map(({ publicKey, account }: any) => ({
    pubkey: publicKey,
    buyer: account.buyer as PublicKey,
    listing: account.listing as PublicKey,
    startedAt: Number(account.startedAt),
    expiresAt: Number(account.expiresAt),
    queriesUsed: Number(account.queriesUsed),
    queriesLimit: Number(account.queriesLimit),
    hasRated: account.hasRated as boolean,
    accessKeyHash: Array.from(account.accessKeyHash) as number[],
    accessKeyActive: account.accessKeyActive as boolean,
    accessKeyIssuedAt: Number(account.accessKeyIssuedAt),
  }));
}

export async function fetchSubscriptionView(
  program: Program,
  listing: PublicKey,
  buyer: PublicKey
) {
  const sub = subscriptionPda(listing, buyer);
  try {
    const acc: any = await (program.account as any).dataSubscription.fetch(sub);
    return {
      pubkey: sub,
      buyer: acc.buyer as PublicKey,
      listing: acc.listing as PublicKey,
      startedAt: Number(acc.startedAt),
      expiresAt: Number(acc.expiresAt),
      queriesUsed: Number(acc.queriesUsed),
      queriesLimit: Number(acc.queriesLimit),
      hasRated: acc.hasRated as boolean,
      accessKeyHash: Array.from(acc.accessKeyHash) as number[],
      accessKeyActive: acc.accessKeyActive as boolean,
      accessKeyIssuedAt: Number(acc.accessKeyIssuedAt),
    };
  } catch {
    return null;
  }
}

export async function fetchProvider(program: Program, wallet: PublicKey) {
  try {
    const acc: any = await (program.account as any).dataProvider.fetch(providerPda(wallet));
    return {
      pubkey: providerPda(wallet),
      wallet: acc.wallet as PublicKey,
      name: acc.name as string,
      totalListings: Number(acc.totalListings),
      totalRevenue: BigInt(acc.totalRevenue.toString()),
      avgQualityScore: Number(acc.avgQualityScore),
      isVerified: acc.isVerified as boolean,
      devicesRegistered: Number(acc.devicesRegistered),
      nextListingId: BigInt(acc.nextListingId.toString()),
      stakeAmount: BigInt(acc.stakeAmount.toString()),
      stakeLockedUntil: Number(acc.stakeLockedUntil),
      slashCount: Number(acc.slashCount),
      lowQualitySince: Number(acc.lowQualitySince),
    };
  } catch {
    return null;
  }
}

export async function fetchExchange(program: Program) {
  try {
    const acc: any = await (program.account as any).dataExchange.fetch(exchangePda());
    return {
      authority: acc.authority as PublicKey,
      treasury: acc.treasury as PublicKey,
      qualityOracle: acc.qualityOracle as PublicKey,
      commissionBps: Number(acc.commissionBps),
      totalListings: Number(acc.totalListings),
      totalTransactions: Number(acc.totalTransactions),
      usdcMint: acc.usdcMint as PublicKey,
      slashThreshold: Number(acc.slashThreshold),
      slashGracePeriod: Number(acc.slashGracePeriod),
      minStakeLamports: BigInt(acc.minStakeLamports.toString()),
    };
  } catch {
    return null;
  }
}

export async function ensureUsdcAta(
  connection: Connection,
  owner: PublicKey,
  payer: PublicKey,
  ixs: TransactionInstruction[]
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    ixs.push(createAssociatedTokenAccountInstruction(payer, ata, owner, USDC_MINT));
  }
  return ata;
}

export function randomAccessKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function accessKeyHashBytes(hex: string): number[] {
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) buf[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  const digest = keccak256.arrayBuffer(buf);
  return Array.from(new Uint8Array(digest));
}

export function commissionPreview(subscriptionPrice: bigint, commissionBps: number, months: number) {
  const total = subscriptionPrice * BigInt(months);
  const commission = (total * BigInt(commissionBps)) / 10_000n;
  const providerShare = total - commission;
  return { total, commission, providerShare };
}
