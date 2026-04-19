const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const config = require('./config');

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS used_tx (
    signature TEXT PRIMARY KEY,
    listing TEXT NOT NULL,
    buyer TEXT NOT NULL,
    kind TEXT NOT NULL,
    seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_keys (
    key_hash BLOB PRIMARY KEY,
    subscription TEXT NOT NULL,
    listing TEXT NOT NULL,
    buyer TEXT NOT NULL,
    exp_at INTEGER NOT NULL,
    queries_limit INTEGER NOT NULL,
    queries_used INTEGER NOT NULL DEFAULT 0,
    issued_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_access_subscription ON access_keys(subscription);
  CREATE INDEX IF NOT EXISTS idx_used_tx_seen ON used_tx(seen_at);
`);

const stmtInsertTx = db.prepare(
  'INSERT OR IGNORE INTO used_tx (signature, listing, buyer, kind, seen_at) VALUES (?, ?, ?, ?, ?)'
);
const stmtLookupTx = db.prepare('SELECT seen_at FROM used_tx WHERE signature = ?');
const stmtSweepTx = db.prepare('DELETE FROM used_tx WHERE seen_at < ?');

const stmtInsertKey = db.prepare(`
  INSERT OR REPLACE INTO access_keys
    (key_hash, subscription, listing, buyer, exp_at, queries_limit, queries_used, issued_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtLookupKey = db.prepare('SELECT * FROM access_keys WHERE key_hash = ?');
const stmtBumpUsage = db.prepare(
  'UPDATE access_keys SET queries_used = queries_used + 1 WHERE key_hash = ?'
);
const stmtRevokeBySubscription = db.prepare('DELETE FROM access_keys WHERE subscription = ?');

module.exports = {
  markTxUsed(signature, listing, buyer, kind) {
    return stmtInsertTx.run(signature, listing, buyer, kind, Date.now());
  },
  isTxUsed(signature) {
    return !!stmtLookupTx.get(signature);
  },
  sweepTx(olderThanMs) {
    return stmtSweepTx.run(olderThanMs).changes;
  },
  storeAccessKey(record) {
    return stmtInsertKey.run(
      record.keyHash,
      record.subscription,
      record.listing,
      record.buyer,
      record.expAt,
      record.queriesLimit,
      record.queriesUsed,
      record.issuedAt
    );
  },
  lookupAccessKey(keyHash) {
    return stmtLookupKey.get(keyHash);
  },
  bumpAccessKeyUsage(keyHash) {
    return stmtBumpUsage.run(keyHash).changes;
  },
  revokeSubscription(subscription) {
    return stmtRevokeBySubscription.run(subscription).changes;
  },
};
