// Off-chain registry that lets a provider bind a real HTTP endpoint to
// their on-chain listing. We never touch the program for this — the listing
// PDA stays minimal and the source URL lives in SQLite.
//
// Ownership is proven by a challenge-response: gateway mints a one-shot
// nonce for a listing, provider signs it with their wallet key, gateway
// verifies the ed25519 signature against listing.provider and then stores
// (url, optional static secret header).
//
// /v1/query then checks this table before reaching for mock data.

const crypto = require('node:crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { PublicKey } = require('@solana/web3.js');

const chain = require('./chain');
const db = require('./db');
const logger = require('./logger');

const CHALLENGE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const URL_MAX_LENGTH = 512;
const SECRET_MAX_LENGTH = 256;

function challengeMessage(nonce, listing, provider) {
  // The exact text the provider's wallet will be asked to sign. Keep it
  // human-readable so Phantom's signMessage prompt is auditable.
  return (
    `DePIN Exchange — bind data source\n\n` +
    `listing:  ${listing}\n` +
    `provider: ${provider}\n` +
    `nonce:    ${nonce}`
  );
}

async function createChallenge(listingPubkey) {
  const listingAccount = await chain.fetchListing(new PublicKey(listingPubkey));
  if (!listingAccount) {
    const e = new Error('listing_not_found');
    e.status = 404;
    throw e;
  }
  const provider = listingAccount.provider.toBase58();
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;

  db.saveChallenge({ nonce, listing: listingPubkey, provider, expiresAt });

  return {
    nonce,
    listing: listingPubkey,
    provider,
    expiresAt,
    message: challengeMessage(nonce, listingPubkey, provider),
  };
}

function verifySignature({ signerBase58, message, signatureBase58 }) {
  try {
    const signer = new PublicKey(signerBase58);
    const sig = bs58.decode(signatureBase58);
    const msgBytes = Buffer.from(message, 'utf8');
    return nacl.sign.detached.verify(msgBytes, sig, signer.toBytes());
  } catch (err) {
    logger.debug({ err: err.message }, 'signature verify threw');
    return false;
  }
}

function normaliseUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > URL_MAX_LENGTH) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function bindSource({ listingPubkey, url, secret, nonce, signatureBase58 }) {
  const normalised = normaliseUrl(url);
  if (!normalised) {
    const e = new Error('invalid_url');
    e.status = 400;
    throw e;
  }
  if (secret && String(secret).length > SECRET_MAX_LENGTH) {
    const e = new Error('secret_too_long');
    e.status = 400;
    throw e;
  }

  const row = db.consumeChallenge(nonce);
  if (!row) {
    const e = new Error('unknown_challenge');
    e.status = 401;
    throw e;
  }
  if (row.expires_at < Date.now()) {
    const e = new Error('challenge_expired');
    e.status = 401;
    throw e;
  }
  if (row.listing !== listingPubkey) {
    const e = new Error('listing_mismatch');
    e.status = 401;
    throw e;
  }

  // Re-verify provider is still the provider — protects against a handover
  // that happened between challenge and PUT. (Contract doesn't support
  // transfer today, but cheap insurance.)
  const listingAccount = await chain.fetchListing(new PublicKey(listingPubkey));
  if (!listingAccount || listingAccount.provider.toBase58() !== row.provider) {
    const e = new Error('provider_changed');
    e.status = 409;
    throw e;
  }

  const message = challengeMessage(nonce, listingPubkey, row.provider);
  const ok = verifySignature({
    signerBase58: row.provider,
    message,
    signatureBase58,
  });
  if (!ok) {
    const e = new Error('bad_signature');
    e.status = 401;
    throw e;
  }

  db.saveListingSource({
    listing: listingPubkey,
    provider: row.provider,
    url: normalised,
    secret: secret || '',
  });

  return { listing: listingPubkey, provider: row.provider, url: normalised, updatedAt: Date.now() };
}

function sweepExpiredChallenges() {
  return db.sweepChallenges();
}

function lookupSource(listingPubkey) {
  return db.getListingSource(listingPubkey);
}

async function proxyQuery({ listingPubkey, source, dataType, limit, buyer }) {
  // Build a simple POST with the context the upstream provider needs to
  // audit the call. Secret (if set) is folded into a single custom header
  // so the provider can gate on it.
  const upstream = new URL(source.url);
  upstream.searchParams.set('type', dataType || 'any');
  if (limit) upstream.searchParams.set('limit', String(limit));

  const headers = {
    accept: 'application/json',
    'x-depin-listing': listingPubkey,
    'x-depin-buyer': buyer,
    'x-depin-gateway': 'depinxchg',
  };
  if (source.secret) headers['x-depin-secret'] = source.secret;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const res = await fetch(upstream.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 2000) };
    }
    return {
      ok: res.ok,
      status: res.status,
      rows: Array.isArray(parsed) ? parsed : parsed?.rows || parsed?.data || parsed,
    };
  } catch (err) {
    logger.warn({ err: err.message, listing: listingPubkey }, 'upstream proxy failed');
    return { ok: false, status: 502, rows: null, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  createChallenge,
  bindSource,
  lookupSource,
  sweepExpiredChallenges,
  proxyQuery,
};
