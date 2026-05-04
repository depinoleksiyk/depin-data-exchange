// Short-TTL cache for on-chain subscription reads. Every /v1/query request
// re-verifies that the subscription is still active, the quota isn't full
// and the access key matches. Doing a fresh RPC round-trip for every query
// turns the gateway into a latency amplifier when devnet is slow — a 5-10 s
// cache collapses a burst into a single fetch while still picking up
// revocations and expiries within seconds.

const DEFAULT_TTL_MS = 7_000;

function now() {
  return Date.now();
}

class SubscriptionCache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.entries = new Map(); // pubkey string -> { sub, expires }
    this.inflight = new Map(); // pubkey string -> Promise<sub | null>
  }

  /** Fetches a subscription, collapsing concurrent callers onto one RPC. */
  async get(pubkey, loader) {
    const key = pubkey.toBase58 ? pubkey.toBase58() : String(pubkey);
    const cached = this.entries.get(key);
    if (cached && cached.expires > now()) {
      return cached.sub;
    }

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const sub = await loader();
        this.entries.set(key, { sub, expires: now() + this.ttlMs });
        return sub;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  invalidate(pubkey) {
    const key = pubkey?.toBase58 ? pubkey.toBase58() : String(pubkey);
    this.entries.delete(key);
  }

  size() {
    return this.entries.size;
  }
}

module.exports = { SubscriptionCache };
