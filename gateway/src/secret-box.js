// AES-256-GCM envelope for secrets stored at rest in SQLite.
// Format: "v1:<nonce_hex>:<tag_hex>:<ciphertext_hex>"
// Legacy plaintext rows (no prefix) decrypt to themselves so existing
// installs keep working until their next write.

const crypto = require('node:crypto');
const logger = require('./logger');

const PREFIX = 'v1:';

let cachedKey = null;
function key() {
  if (cachedKey) return cachedKey;
  const raw = process.env.GATEWAY_SECRET_KEY || '';
  if (!raw) {
    logger.warn(
      'GATEWAY_SECRET_KEY not set — listing-source secrets stored in plaintext. ' +
        'Set a 64-char hex master key before production use.'
    );
    return null;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('GATEWAY_SECRET_KEY must be 64 hex chars (32 bytes)');
  }
  cachedKey = Buffer.from(raw, 'hex');
  return cachedKey;
}

function encrypt(plaintext) {
  if (!plaintext) return '';
  const k = key();
  if (!k) return String(plaintext); // fallback: passthrough for dev without a key
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function decrypt(stored) {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const k = key();
  if (!k) {
    logger.error('encrypted secret found but GATEWAY_SECRET_KEY missing');
    return '';
  }
  const [, ivHex, tagHex, ctHex] = stored.split(':');
  if (!ivHex || !tagHex || !ctHex) {
    logger.error('malformed encrypted secret envelope');
    return '';
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]);
    return pt.toString('utf8');
  } catch (err) {
    logger.error({ err: err.message }, 'secret decrypt failed (tampered or wrong key)');
    return '';
  }
}

module.exports = { encrypt, decrypt };
