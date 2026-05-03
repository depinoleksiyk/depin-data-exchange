const crypto = require('node:crypto');
const { keccak256 } = require('js-sha3');

// The on-chain program hashes access keys with keccak256 (Solana sol_keccak256
// syscall). We must use the same hash here so the digest we store matches
// what ends up in DataSubscription.access_key_hash.
function hashKey(rawHex) {
  const bytes = Buffer.from(rawHex, 'hex');
  return Buffer.from(keccak256.arrayBuffer(bytes));
}

function randomAccessKey() {
  return crypto.randomBytes(32).toString('hex');
}

function toHex(buf) {
  return Buffer.from(buf).toString('hex');
}

function constantTimeEqual(a, b) {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseBearer(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  if (!/^[0-9a-fA-F]{64}$/.test(parts[1])) return null;
  return parts[1].toLowerCase();
}

module.exports = {
  hashKey,
  randomAccessKey,
  toHex,
  constantTimeEqual,
  parseBearer,
};
