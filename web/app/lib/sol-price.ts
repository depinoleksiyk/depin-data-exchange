'use client';

import { useEffect, useRef, useState } from 'react';

// CoinGecko free tier — no key, ~30 requests/minute per IP. We poll every
// 30 s and cache the last successful value in memory so a transient outage
// doesn't kill the pay-with-SOL button.

const PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_last_updated_at=true';
const REFRESH_MS = 30_000;

type SolPrice = {
  usd: number;
  updatedAt: number; // ms
  source: 'coingecko' | 'fallback';
};

let cached: SolPrice | null = null;
let inflight: Promise<SolPrice | null> | null = null;

async function fetchPrice(): Promise<SolPrice | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(PRICE_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error(`coingecko ${r.status}`);
      const body = await r.json();
      const usd = Number(body?.solana?.usd);
      if (!Number.isFinite(usd) || usd <= 0) throw new Error('bad price payload');
      const next: SolPrice = {
        usd,
        updatedAt: Number(body?.solana?.last_updated_at) * 1000 || Date.now(),
        source: 'coingecko',
      };
      cached = next;
      return next;
    } catch {
      // Fallback to last good value if we had one, otherwise a devnet-safe
      // placeholder. Users see the "stale" badge in the UI either way.
      if (cached) return { ...cached, source: 'fallback' };
      return { usd: 150, updatedAt: Date.now(), source: 'fallback' };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useSolPrice(): { price: SolPrice | null; refresh: () => void } {
  const [price, setPrice] = useState<SolPrice | null>(cached);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const p = await fetchPrice();
      if (!cancelled) setPrice(p);
    };
    tick();
    timerRef.current = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    price,
    refresh: () => {
      fetchPrice().then((p) => setPrice(p));
    },
  };
}

/**
 * Convert a USDC raw amount (6 decimals) to SOL lamports at the given
 * USD-per-SOL price. Result is rounded up and padded with `slippageBps`
 * worth of buffer so tiny rate moves between quote and sign don't fail
 * the tx.
 */
export function usdcRawToLamports(
  usdcRaw: bigint | number,
  solUsd: number,
  slippageBps = 100 // 1 %
): bigint {
  const usdcMicro = typeof usdcRaw === 'bigint' ? Number(usdcRaw) : usdcRaw;
  if (!Number.isFinite(usdcMicro) || usdcMicro <= 0 || !Number.isFinite(solUsd) || solUsd <= 0) return 0n;
  // usdc_micro / 1e6 = USD; USD / solUsd = SOL; SOL * 1e9 = lamports
  // simplifies to: usdc_micro * 1e3 / solUsd
  const base = (usdcMicro * 1_000) / solUsd;
  const withSlip = base * (1 + slippageBps / 10_000);
  return BigInt(Math.ceil(withSlip));
}

export function formatSol(lamports: bigint | number, digits = 4): string {
  const n = typeof lamports === 'bigint' ? Number(lamports) : lamports;
  return (n / 1_000_000_000).toFixed(digits);
}
