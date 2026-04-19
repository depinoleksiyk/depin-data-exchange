const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const http = require('node:http');
const { WebSocketServer } = require('ws');
const { PublicKey } = require('@solana/web3.js');

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const chain = require('./chain');
const data = require('./data');
const {
  hashKey,
  parseBearer,
  constantTimeEqual,
  toHex,
} = require('./access-keys');
const { SubscriptionCache } = require('./sub-cache');
const paySol = require('./pay-sol');

const subscriptionCache = new SubscriptionCache(config.subCacheTtlMs);

const app = express();

// --- middleware ---------------------------------------------------------
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
app.use(
  express.json({
    limit: config.bodyLimit,
  })
);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl / server-side
    if (config.corsOrigins.length === 0) return cb(null, true); // dev = wildcard
    cb(null, config.corsOrigins.includes(origin));
  },
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-buyer-pubkey', 'x-payment-tx'],
};
app.use(cors(corsOptions));

// Baseline limiter — per-IP for all unauthenticated traffic. Generous so
// preview / listings / sample-proof aren't painful during dev.
const baseLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Dedicated limiter for /v1/query/* — keyed by the hash of the access-key
// bearer token when one is present, so a single paying customer sharing an
// office IP isn't bottlenecked by everyone else. Falls back to IP for the
// missing/invalid-bearer case (which will be rejected by the auth step
// anyway, but we still want to throttle it).
const authedLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxAuthed,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const bearer = parseBearer(req.headers.authorization);
    if (bearer) return `bearer:${bearer.slice(0, 16)}`;
    return `ip:${req.ip || 'unknown'}`;
  },
});

app.use((req, res, next) => {
  if (req.path.startsWith('/v1/query/')) {
    return authedLimiter(req, res, next);
  }
  return baseLimiter(req, res, next);
});

// --- helpers ------------------------------------------------------------

function problem(res, status, code, message, extras = {}) {
  return res.status(status).json({ error: code, message, ...extras });
}

async function authenticateAccessKey(req) {
  const key = parseBearer(req.headers.authorization);
  if (!key) return { ok: false, reason: 'missing_bearer' };
  const keyHash = hashKey(key);
  const row = db.lookupAccessKey(keyHash);
  if (!row) return { ok: false, reason: 'unknown_key' };

  const now = Math.floor(Date.now() / 1000);
  if (row.exp_at < now) return { ok: false, reason: 'expired' };
  if (row.queries_used >= row.queries_limit) return { ok: false, reason: 'quota_exhausted' };

  // Re-verify on-chain, but cache briefly so bursts of queries collapse onto
  // one RPC round-trip. Revocations are still visible within the TTL (and
  // immediately if the AccessKeyRevoked event arrives over our WS feed).
  const subPubkey = new PublicKey(row.subscription);
  const sub = await subscriptionCache.get(subPubkey, () =>
    chain.fetchSubscription(subPubkey)
  );
  if (!sub) return { ok: false, reason: 'subscription_gone' };
  if (!sub.accessKeyActive) return { ok: false, reason: 'access_key_revoked' };
  if (!constantTimeEqual(keyHash, Buffer.from(sub.accessKeyHash))) {
    return { ok: false, reason: 'key_mismatch' };
  }
  if (Number(sub.expiresAt) <= now) return { ok: false, reason: 'subscription_expired' };
  if (Number(sub.queriesUsed) >= Number(sub.queriesLimit)) {
    return { ok: false, reason: 'chain_quota_exhausted' };
  }

  return { ok: true, keyHash, row, sub };
}

// --- routes -------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'depin-data-gateway',
    programId: config.programId,
    rpc: config.rpcUrl.replace(/[?&]api-key=.+$/, ''),
  });
});

app.get('/v1/listings', (_req, res) => {
  res.json({ dataTypes: data.listingMetadata() });
});

app.get('/v1/preview/:listingId', (req, res) => {
  const { listingId } = req.params;
  const { type } = req.query;
  const sample = data.samplesFor(type).rows.slice(0, 1);
  res.json({
    listingId,
    preview: true,
    dataType: data.samplesFor(type).type,
    sample,
    note: 'Issue an access key via /v1/access-keys/issue for full access',
  });
});

// Activate an access key: client generates it locally, commits the hash
// on-chain via issue_access_key, then proves control by submitting the raw
// key + the tx signature here.
app.post('/v1/access-keys/issue', async (req, res) => {
  const { subscription, accessKey, txSignature } = req.body || {};
  if (!subscription || !accessKey || !txSignature) {
    return problem(res, 400, 'invalid_body', 'subscription, accessKey and txSignature required');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(accessKey)) {
    return problem(res, 400, 'invalid_access_key', 'access key must be 32-byte hex');
  }

  let subPubkey;
  try {
    subPubkey = new PublicKey(subscription);
  } catch {
    return problem(res, 400, 'invalid_subscription', 'subscription not a valid pubkey');
  }

  // Atomic reservation closes the TOCTOU window — only one concurrent
  // request can ever verify this signature.
  if (!db.reserveTx(txSignature, 'access_key')) {
    return problem(res, 409, 'tx_already_used', 'this tx signature was already consumed');
  }

  try {
    const parsed = await chain.fetchTxEvents(txSignature);
    if (!parsed.ok) {
      db.releaseTx(txSignature);
      return problem(res, 402, 'tx_unverified', parsed.reason);
    }
    const issued = parsed.events.find((e) => e.name === 'AccessKeyIssued');
    if (!issued) {
      db.releaseTx(txSignature);
      return problem(res, 422, 'wrong_tx', 'tx did not emit AccessKeyIssued event');
    }
    if (issued.data.subscription.toBase58() !== subscription) {
      db.releaseTx(txSignature);
      return problem(res, 422, 'subscription_mismatch', 'tx event references a different subscription');
    }

    const sub = await chain.fetchSubscription(subPubkey);
    if (!sub) {
      db.releaseTx(txSignature);
      return problem(res, 404, 'subscription_not_found', 'on-chain subscription missing');
    }

    const keyHash = hashKey(accessKey);
    if (!constantTimeEqual(keyHash, Buffer.from(sub.accessKeyHash))) {
      db.releaseTx(txSignature);
      return problem(res, 422, 'hash_mismatch', 'provided key does not match on-chain hash');
    }
    if (!sub.accessKeyActive) {
      db.releaseTx(txSignature);
      return problem(res, 409, 'key_inactive', 'on-chain record shows key is not active');
    }

    const now = Math.floor(Date.now() / 1000);
    const expAt = Math.min(Number(sub.expiresAt), now + config.accessKeyTtlSec);
    db.storeAccessKey({
      keyHash,
      subscription,
      listing: sub.listing.toBase58(),
      buyer: sub.buyer.toBase58(),
      expAt,
      queriesLimit: Number(sub.queriesLimit),
      queriesUsed: Number(sub.queriesUsed),
      issuedAt: now,
    });
    db.finalizeTx(txSignature, sub.listing.toBase58(), sub.buyer.toBase58());

    return res.json({
      ok: true,
      listing: sub.listing.toBase58(),
      buyer: sub.buyer.toBase58(),
      expAt,
      queriesLimit: Number(sub.queriesLimit),
    });
  } catch (err) {
    db.releaseTx(txSignature);
    throw err;
  }
});

// Fire a query using an access key.
app.post('/v1/query/:listingId', async (req, res) => {
  const auth = await authenticateAccessKey(req);
  if (!auth.ok) {
    const status = auth.reason === 'missing_bearer' ? 401 : 403;
    return problem(res, status, auth.reason, 'access key validation failed');
  }

  const { listingId } = req.params;
  const { dataType, limit } = req.body || {};

  if (auth.row.listing !== listingId) {
    return problem(res, 403, 'listing_mismatch', 'access key is for a different listing');
  }

  const samples = data.samplesFor(dataType);
  const rows = limit && Number.isFinite(+limit) ? samples.rows.slice(0, +limit) : samples.rows;

  db.bumpAccessKeyUsage(auth.keyHash);

  res.json({
    listing: auth.row.listing,
    dataType: samples.type,
    rows,
    count: rows.length,
    deliveredAt: new Date().toISOString(),
    quota: {
      used: auth.row.queries_used + 1,
      limit: auth.row.queries_limit,
    },
  });
});

// Pay-per-query path: buyer submits a query_data tx, we verify event + deliver.
app.post('/v1/query-tx/:listingId', async (req, res) => {
  const { listingId } = req.params;
  const { txSignature, dataType, limit } = req.body || {};

  if (!txSignature) return problem(res, 400, 'missing_tx', 'txSignature required');

  if (!db.reserveTx(txSignature, 'pay_per_query')) {
    return problem(res, 409, 'tx_already_used', 'this signature was already consumed');
  }

  try {
    const parsed = await chain.fetchTxEvents(txSignature);
    if (!parsed.ok) {
      db.releaseTx(txSignature);
      return problem(res, 402, 'tx_unverified', parsed.reason);
    }
    const executed = parsed.events.find((e) => e.name === 'QueryExecuted');
    if (!executed) {
      db.releaseTx(txSignature);
      return problem(res, 422, 'wrong_tx', 'tx did not emit QueryExecuted event');
    }
    if (executed.data.listing.toBase58() !== listingId) {
      db.releaseTx(txSignature);
      return problem(res, 422, 'listing_mismatch', 'event listing does not match path');
    }

    db.finalizeTx(
      txSignature,
      executed.data.listing.toBase58(),
      executed.data.buyer.toBase58()
    );

    const samples = data.samplesFor(dataType);
    const rows = limit && Number.isFinite(+limit) ? samples.rows.slice(0, +limit) : samples.rows;
    return res.json({
      listing: listingId,
      buyer: executed.data.buyer.toBase58(),
      dataType: samples.type,
      rows,
      count: rows.length,
      deliveredAt: new Date().toISOString(),
    });
  } catch (err) {
    db.releaseTx(txSignature);
    throw err;
  }
});

// Co-sign a "pay with SOL" transaction: buyer pays SOL, gateway mints
// matching USDC into their ATA, subscribe runs as usual. Only signs txs
// whose shape matches the expected three-instruction template.
app.post('/v1/pay-with-sol', async (req, res) => {
  if (!config.mintAuthorityKeypairPath) {
    return problem(res, 503, 'sol_payment_disabled', 'gateway has no mint authority configured');
  }
  const { serializedTx, listing, buyer, durationMonths, solLamports, solPriceUsd, slippageBps } = req.body || {};
  if (!serializedTx || !listing || !buyer || !durationMonths || !solLamports || !solPriceUsd) {
    return problem(res, 400, 'invalid_body', 'missing fields');
  }
  try {
    const { sig } = await paySol.coSignAndSubmit({
      serializedTx,
      listingPubkey: listing,
      buyer,
      durationMonths: Number(durationMonths),
      solLamports: String(solLamports),
      solPriceUsd: Number(solPriceUsd),
      slippageBps: Number(slippageBps ?? 100),
    });
    return res.json({ ok: true, signature: sig });
  } catch (err) {
    const status = err?.status || 500;
    const code = status === 422 ? 'tx_shape_rejected' : 'pay_sol_failed';
    return problem(res, status, code, err.message || 'unknown error');
  }
});

// Serve a random sample + Merkle proof matching the current committed root.
app.get('/v1/sample-proof/:listingId', async (req, res) => {
  const { listingId } = req.params;
  const { type } = req.query;

  const samples = data.samplesFor(type);
  const tree = data.buildMerkle(samples.rows);
  const idx = Math.floor(Math.random() * samples.rows.length);
  const leaf = samples.rows[idx];
  const proof = data.proofFor(tree.layers, idx);

  let onChainRoot = null;
  try {
    const listing = await chain.fetchListing(new PublicKey(listingId));
    if (listing && listing.snapshotRoot) {
      onChainRoot = Buffer.from(listing.snapshotRoot).toString('hex');
    }
  } catch {
    // listingId can be a shorthand for demo purposes — proof still valid off-chain.
  }

  res.json({
    listing: listingId,
    dataType: samples.type,
    leaf,
    leafHash: toHex(data.leafHashFor(leaf)),
    root: toHex(tree.root),
    onChainRoot,
    proof,
  });
});

// Expose which subscription a buyer owns for a listing — frontend helper.
app.get('/v1/subscription', async (req, res) => {
  const { listing, buyer } = req.query;
  if (!listing || !buyer) return problem(res, 400, 'missing_params', 'listing & buyer required');
  try {
    const listingPubkey = new PublicKey(listing);
    const buyerPubkey = new PublicKey(buyer);
    const subPubkey = chain.findSubscriptionPda(listingPubkey, buyerPubkey);
    const sub = await chain.fetchSubscription(subPubkey);
    if (!sub) return res.json({ found: false, subscription: subPubkey.toBase58() });
    res.json({
      found: true,
      subscription: subPubkey.toBase58(),
      expiresAt: Number(sub.expiresAt),
      queriesUsed: Number(sub.queriesUsed),
      queriesLimit: Number(sub.queriesLimit),
      hasRated: sub.hasRated,
      accessKeyActive: sub.accessKeyActive,
    });
  } catch (err) {
    return problem(res, 400, 'invalid_pubkey', err.message);
  }
});

// --- 404 + error shields ------------------------------------------------
app.use((req, res) => problem(res, 404, 'not_found', `no route for ${req.method} ${req.url}`));
app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, 'unhandled error');
  res.status(500).json({ error: 'internal_error', message: 'unexpected server error' });
});

// --- server + WebSocket fanout ------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/events' });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', programId: config.programId }));
  ws.on('error', () => {}); // keep server alive on client aborts
});

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

let logSubscriptionId = null;
async function wireProgramStream() {
  if (logSubscriptionId !== null) {
    // avoid stacking duplicate listeners on reconnect
    try {
      await chain.getConnection().removeOnLogsListener(logSubscriptionId);
    } catch {
      /* listener may already be gone */
    }
    logSubscriptionId = null;
  }
  try {
    logSubscriptionId = await chain.subscribeToProgramLogs((event) => {
      const safeData = {};
      for (const [k, v] of Object.entries(event.data || {})) {
        if (v && typeof v === 'object') {
          if (typeof v.toBase58 === 'function') {
            safeData[k] = v.toBase58();
          } else if (typeof v.toString === 'function' && v.constructor?.name === 'BN') {
            safeData[k] = v.toString();
          } else if (Array.isArray(v)) {
            safeData[k] = v;
          } else {
            try {
              safeData[k] = JSON.parse(JSON.stringify(v));
            } catch {
              safeData[k] = String(v);
            }
          }
        } else {
          safeData[k] = v;
        }
      }
      broadcast({ type: 'event', name: event.name, data: safeData, signature: event.signature });
      const subPubkey = event.data?.subscription;
      if (subPubkey) {
        try {
          subscriptionCache.invalidate(subPubkey);
        } catch (err) {
          logger.debug({ err: err.message }, 'cache invalidate failed');
        }
      }
      if (event.name === 'AccessKeyRevoked' && subPubkey) {
        try {
          db.revokeSubscription(subPubkey.toBase58());
        } catch (err) {
          logger.debug({ err: err.message }, 'revoke handler failed');
        }
      }
    });
    logger.info({ id: logSubscriptionId }, 'subscribed to program logs');
  } catch (err) {
    logger.warn({ err: err.message }, 'program log subscription failed (continuing without stream)');
  }
}

// Sweep stale tx records once an hour. Confirmed rows age out at the
// configured replay TTL; pending rows live 60 s — more than enough for the
// verification round-trip but short enough that crashed handlers don't leave
// the signature blocked forever.
setInterval(() => {
  const now = Date.now();
  const { confirmed, pending } = db.sweepTx(
    now - config.replayTtlSec * 1000,
    now - 60 * 1000
  );
  if (confirmed > 0 || pending > 0) {
    logger.debug({ confirmed, pending }, 'replay-store swept');
  }
}, 60 * 60 * 1000).unref();

server.listen(config.port, () => {
  logger.info(
    { port: config.port, programId: config.programId, rpc: config.rpcUrl },
    'depin-data-gateway listening'
  );
  if (process.env.GATEWAY_SKIP_STREAM !== '1') {
    wireProgramStream();
  }
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
