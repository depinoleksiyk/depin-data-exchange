require('dotenv').config();

const path = require('node:path');

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function listEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Railway injects PORT — read it first so health probes hit the right socket.
const config = {
  port: intEnv('PORT', 0) || intEnv('GATEWAY_PORT', 4001),
  rpcUrl: process.env.GATEWAY_RPC_URL || 'https://api.devnet.solana.com',
  wsRpcUrl: process.env.GATEWAY_WS_RPC_URL || undefined,
  programId: process.env.PROGRAM_ID || '3gGkKra1uhoDukSkFLCux8j3gkxoMdUjzMfHzLGKkyzk',
  idlPath: process.env.IDL_PATH || (() => {
    const bundled = path.join(__dirname, '..', 'idl.json');
    const repoFallback = path.join(__dirname, '..', '..', 'target', 'idl', 'exchange.json');
    return require('node:fs').existsSync(bundled) ? bundled : repoFallback;
  })(),
  dbPath: process.env.GATEWAY_DB_PATH || path.join(__dirname, '../data/gateway.sqlite'),
  bodyLimit: process.env.GATEWAY_BODY_LIMIT || '64kb',
  corsOrigins: listEnv('GATEWAY_CORS_ORIGINS'),
  // Explicit opt-in for accept-any-origin (dev convenience). Default: false.
  corsAllowAll: (process.env.GATEWAY_CORS_ALLOW_ALL || '').toLowerCase() === 'true',
  rateLimit: {
    windowMs: intEnv('GATEWAY_RATE_WINDOW_MS', 60_000),
    max: intEnv('GATEWAY_RATE_MAX', 60),
    // separate, higher ceiling for authenticated /v1/query/* — each buyer
    // gets their own bucket keyed on the bearer hash.
    maxAuthed: intEnv('GATEWAY_RATE_MAX_AUTHED', 240),
  },
  replayTtlSec: intEnv('GATEWAY_REPLAY_TTL_SEC', 30 * 24 * 3600), // 30 days
  accessKeyTtlSec: intEnv('GATEWAY_ACCESS_KEY_TTL_SEC', 24 * 3600),
  // TTL for the subscription-verify cache. Lower = fresher, higher = cheaper
  // on RPC; revoke events invalidate immediately via WS regardless.
  subCacheTtlMs: intEnv('GATEWAY_SUB_CACHE_TTL_MS', 7_000),

  // Mint authority for mock USDC. Gateway co-signs pay-with-SOL transactions
  // with this keypair so SOL-native buyers can subscribe without holding
  // USDC. Leave unset to disable the endpoint entirely.
  mintAuthorityKeypairPath: process.env.GATEWAY_MINT_AUTHORITY_KEYPAIR_PATH || '',
  usdcMint: process.env.USDC_MINT || 'HaSyCU2nb7ffrfepbDccqB2Q2oGin9V9YkFjjAcdpQXd',
};

module.exports = config;
