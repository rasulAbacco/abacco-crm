// AES-256-GCM encryption for SMTP credentials at rest.
// ENCRYPTION_KEYS="1:<base64 32 bytes>,2:<base64 32 bytes>" supports key rotation:
// new data is written with ENCRYPTION_ACTIVE_KEY_VERSION, old versions stay readable.
import crypto from 'node:crypto';
import config from '../../config/environment.js';

function parseKeys(raw) {
  const keys = new Map();
  for (const part of raw.split(',')) {
    const [version, b64] = part.trim().split(':');
    const key = Buffer.from(b64 ?? '', 'base64');
    if (!/^\d+$/.test(version) || key.length !== 32) {
      throw new Error('ENCRYPTION_KEYS must look like "1:<base64 of 32 random bytes>"');
    }
    keys.set(Number(version), key);
  }
  return keys;
}

const KEYS = parseKeys(config.ENCRYPTION_KEYS);
if (!KEYS.has(config.ENCRYPTION_ACTIVE_KEY_VERSION)) {
  throw new Error('ENCRYPTION_ACTIVE_KEY_VERSION does not match any key in ENCRYPTION_KEYS');
}

export function encryptJson(payload, aad = '') {
  const keyVersion = config.ENCRYPTION_ACTIVE_KEY_VERSION;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEYS.get(keyVersion), iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyVersion,
  };
}

export function decryptJson({ ciphertext, iv, tag, keyVersion }, aad = '') {
  const key = KEYS.get(keyVersion);
  if (!key) throw new Error(`Encryption key version ${keyVersion} is not configured`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
