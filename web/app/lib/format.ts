import { USDC_DECIMALS } from './constants';

export function fromUsdcRaw(raw: bigint | number | string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'bigint' ? Number(raw) : Number(raw);
  return n / 10 ** USDC_DECIMALS;
}

export function toUsdcRaw(value: number): bigint {
  return BigInt(Math.round(value * 10 ** USDC_DECIMALS));
}

export function formatUsdc(value: number, fractionDigits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function shortAddress(pubkey: string | undefined | null, chars = 4): string {
  if (!pubkey) return '—';
  if (pubkey.length <= chars * 2 + 2) return pubkey;
  return `${pubkey.slice(0, chars)}…${pubkey.slice(-chars)}`;
}

export function relativeTime(unixSeconds: number | bigint): string {
  const t = Number(unixSeconds);
  // Zero / never-set timestamps show "never" instead of "56y ago"
  if (!Number.isFinite(t) || t <= 0) return 'never';
  const now = Math.floor(Date.now() / 1000);
  const delta = t - now;
  const abs = Math.abs(delta);
  const units: Array<[string, number]> = [
    ['y', 365 * 24 * 3600],
    ['mo', 30 * 24 * 3600],
    ['d', 24 * 3600],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  for (const [suffix, size] of units) {
    if (abs >= size) {
      const value = Math.floor(abs / size);
      return delta >= 0 ? `in ${value}${suffix}` : `${value}${suffix} ago`;
    }
  }
  return 'just now';
}

export function qualityLabel(score: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 85) return { label: 'Excellent', tone: 'good' };
  if (score >= 65) return { label: 'Reliable', tone: 'good' };
  if (score >= 45) return { label: 'Mixed', tone: 'warn' };
  return { label: 'At risk', tone: 'bad' };
}

// Stale data detector — last_update_ts older than 24h flags the listing as
// not currently flowing. Buyers should pause subscription before stale data
// rolls into their downstream models.
export function isStale(lastUpdateUnix: number | bigint | null | undefined): boolean {
  if (lastUpdateUnix === null || lastUpdateUnix === undefined) return true;
  const t = Number(lastUpdateUnix);
  if (!Number.isFinite(t) || t <= 0) return true;
  const ageSeconds = Math.floor(Date.now() / 1000) - t;
  return ageSeconds > 24 * 3600;
}

export function bytesToHex(bytes: Uint8Array | number[] | undefined): string {
  if (!bytes) return '';
  const arr = Array.isArray(bytes) ? bytes : Array.from(bytes);
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}
