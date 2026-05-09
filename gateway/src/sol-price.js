// Server-side SOL/USD oracle. CoinGecko free tier, cached 30s in-memory.
// Gateway uses this as the source of truth when validating pay-with-SOL
// slippage windows — never trust the client-declared price.

const logger = require('./logger');

const PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
const TTL_MS = 30_000;
const HARD_MAX_AGE_MS = 10 * 60_000; // 10 min — refuse quotes beyond this
// Client price must agree with the oracle within this band to be accepted.
const CLIENT_DEVIATION_TOLERANCE = 0.03; // 3 %

let cache = null; // { usd, fetchedAt }
let inflight = null;

async function fetchFresh() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(PRICE_URL, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(4_000),
      });
      if (!r.ok) throw new Error(`coingecko http ${r.status}`);
      const body = await r.json();
      const usd = Number(body?.solana?.usd);
      if (!Number.isFinite(usd) || usd <= 0) throw new Error('bad payload');
      cache = { usd, fetchedAt: Date.now() };
      return cache;
    } catch (err) {
      logger.warn({ err: err.message }, 'sol-price fetch failed');
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function getTrustedSolUsd() {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.usd;
  const fresh = await fetchFresh();
  if (fresh) return fresh.usd;
  // Fetch failed — only fall back to cache if it's still within hard max.
  if (cache && now - cache.fetchedAt < HARD_MAX_AGE_MS) return cache.usd;
  const e = new Error('sol_price_unavailable');
  e.status = 503;
  throw e;
}

function assertClientPriceAgrees(clientUsd, trustedUsd) {
  if (!Number.isFinite(clientUsd) || clientUsd <= 0) {
    const e = new Error('client_price_invalid');
    e.status = 400;
    throw e;
  }
  const drift = Math.abs(clientUsd - trustedUsd) / trustedUsd;
  if (drift > CLIENT_DEVIATION_TOLERANCE) {
    const e = new Error(
      `client_price_out_of_band: client=${clientUsd} trusted=${trustedUsd.toFixed(2)} drift=${(drift * 100).toFixed(2)}%`
    );
    e.status = 422;
    throw e;
  }
}

module.exports = {
  getTrustedSolUsd,
  assertClientPriceAgrees,
  CLIENT_DEVIATION_TOLERANCE,
};
