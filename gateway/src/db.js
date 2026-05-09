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
    listing TEXT NOT NULL DEFAULT '',
    buyer TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed'
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

// Older installs may lack the status column; backfill it before the index
// that depends on it is created.
const existingCols = db.prepare("PRAGMA table_info(used_tx)").all().map((c) => c.name);
if (!existingCols.includes('status')) {
  db.exec("ALTER TABLE used_tx ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_used_tx_status ON used_tx(status, seen_at);');

// --- tx reserve / finalize / release ------------------------------------

// Inserts a pending row. Throws (SQLITE_CONSTRAINT) if the signature is
// already reserved — caller interprets that as "duplicate tx attempt".
// Explicitly write empty strings into listing/buyer — older DBs may have
// those columns as NOT NULL without a default, so we never rely on DDL
// defaults here.
const stmtReserveTx = db.prepare(
  "INSERT INTO used_tx (signature, listing, buyer, kind, seen_at, status) VALUES (?, '', '', ?, ?, 'pending')"
);

// Promotes a pending reservation to confirmed with full metadata.
const stmtFinalizeTx = db.prepare(
  "UPDATE used_tx SET listing = ?, buyer = ?, status = 'confirmed' WHERE signature = ? AND status = 'pending'"
);

// Drops a pending reservation that failed verification.
const stmtReleaseTx = db.prepare(
  "DELETE FROM used_tx WHERE signature = ? AND status = 'pending'"
);

// Lookup — returns whatever row exists (pending or confirmed).
const stmtLookupTx = db.prepare(
  'SELECT signature, listing, buyer, kind, seen_at, status FROM used_tx WHERE signature = ?'
);

// Time-based cleanup for both stuck-pending rows (short TTL) and confirmed
// rows (long TTL).
const stmtSweepConfirmedTx = db.prepare(
  "DELETE FROM used_tx WHERE status = 'confirmed' AND seen_at < ?"
);
const stmtSweepPendingTx = db.prepare(
  "DELETE FROM used_tx WHERE status = 'pending' AND seen_at < ?"
);

// --- access key cache ---------------------------------------------------

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
  /**
   * Atomically reserve a tx signature as pending. Returns true if we now own
   * the slot, false if another request already reserved/used it. No async
   * gap between check and insert — better-sqlite3 is synchronous.
   */
  reserveTx(signature, kind) {
    try {
      stmtReserveTx.run(signature, kind, Date.now());
      return true;
    } catch (err) {
      if (err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return false;
      throw err;
    }
  },
  /** Turn a successful reservation into a permanent record. */
  finalizeTx(signature, listing, buyer) {
    const res = stmtFinalizeTx.run(listing || '', buyer || '', signature);
    return res.changes > 0;
  },
  /** Drop a failed reservation so the signature can be retried. */
  releaseTx(signature) {
    return stmtReleaseTx.run(signature).changes;
  },
  lookupTx(signature) {
    return stmtLookupTx.get(signature);
  },
  sweepTx(confirmedOlderThanMs, pendingOlderThanMs) {
    const c = stmtSweepConfirmedTx.run(confirmedOlderThanMs).changes;
    const p = stmtSweepPendingTx.run(pendingOlderThanMs).changes;
    return { confirmed: c, pending: p };
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
