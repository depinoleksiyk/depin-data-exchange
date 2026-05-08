import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('3gGkKra1uhoDukSkFLCux8j3gkxoMdUjzMfHzLGKkyzk');
export const USDC_MINT = new PublicKey('HaSyCU2nb7ffrfepbDccqB2Q2oGin9V9YkFjjAcdpQXd');
export const TREASURY_ATA = new PublicKey('9NeKXD4qwuWMcG4zp8tfEjKjAGu3UyoeKcbgS1kgdjyT');
export const EXCHANGE_AUTHORITY = new PublicKey('GdJjiGsy2Q1khUeEVNgySeS2DM56n28qR4jQgFyXzCo6');
export const QUALITY_ORACLE = new PublicKey('5WzNciDLMFBDEGGFG2uV8a3p4CdZfY1fDHDLh4M85x6k');

export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '';
export const EXPLORER_CLUSTER = 'devnet';

export const EXCHANGE_SEED = 'data_exchange';
export const LISTING_SEED = 'listing';
export const PROVIDER_SEED = 'provider';
export const SUBSCRIPTION_SEED = 'subscription';
export const STAKE_VAULT_SEED = 'stake_vault';

export const USDC_DECIMALS = 6;
export const LAMPORTS_PER_SOL_BI = 1_000_000_000n;

export const DATA_TYPES = ['GPS', 'Weather', 'Network', 'Camera'] as const;
export type DataTypeName = (typeof DATA_TYPES)[number];

export const DATA_TYPE_META: Record<
  DataTypeName,
  { label: string; tag: string; dot: string; accent: string }
> = {
  GPS:     { label: 'GPS / Mobility',    tag: 'bg-forest-soft text-forest-dark',   dot: 'bg-forest',    accent: '#2d5a27' },
  Weather: { label: 'Weather / Climate', tag: 'bg-sunflower-soft text-sunflower',  dot: 'bg-sunflower', accent: '#c79215' },
  Network: { label: 'Network / Signal',  tag: 'bg-clay-soft text-clay',            dot: 'bg-clay',      accent: '#b4552c' },
  Camera:  { label: 'Imagery / Vision',  tag: 'bg-earth-100 text-ink',             dot: 'bg-ink',       accent: '#1c1816' },
};
