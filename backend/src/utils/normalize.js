import crypto from 'node:crypto';

export function normalizeEmail(email) {
  if (email == null) return null;
  const trimmed = String(email).trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

// Used by suppression/unsubscribe so an erased address stays blocked.
export function hashEmail(email) {
  const n = normalizeEmail(email);
  return n ? crypto.createHash('sha256').update(n).digest('hex') : null;
}

export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}
