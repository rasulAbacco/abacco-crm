// Account-wide do-not-mail list. Shared contacts inherit it automatically
// because it is keyed by the hashed address, not by Sales ID.
import prisma from '../../prisma/client.js';
import { hashEmail, normalizeEmail } from '../../utils/normalize.js';

export async function suppressedHashes(accountId, emails, db = prisma) {
  const hashes = emails.map(hashEmail).filter(Boolean);
  if (!hashes.length) return new Set();
  const rows = await db.suppression.findMany({ where: { accountId, emailHash: { in: hashes } }, select: { emailHash: true } });
  return new Set(rows.map((r) => r.emailHash));
}

export async function isSuppressed(accountId, email, db = prisma) {
  const h = hashEmail(email);
  if (!h) return null;
  const r = await db.suppression.findUnique({ where: { accountId_emailHash: { accountId, emailHash: h } }, select: { reason: true } });
  return r?.reason ?? null;
}

export async function suppress(accountId, email, { reason, source = 'MANUAL', countryCode, note, campaignId }, db = prisma) {
  const emailNormalized = normalizeEmail(email);
  const emailHash = hashEmail(emailNormalized);
  if (!emailHash) return null;
  const row = await db.suppression.upsert({
    where: { accountId_emailHash: { accountId, emailHash } },
    create: { accountId, emailNormalized, emailHash, reason, source, countryCode, note, campaignId },
    update: {},
  });
  // Mark list memberships so lists show the right status.
  const status = reason === 'HARD_BOUNCE' ? 'BOUNCED' : 'UNSUBSCRIBED';
  await db.emailListContact.updateMany({
    where: { status: 'SUBSCRIBED', contact: { accountId, emailNormalized } },
    data: { status, unsubscribedAt: new Date() },
  });
  return row;
}

/** Consent state per email for countries that need prior consent. */
export async function consentedHashes(accountId, emails, db = prisma) {
  const hashes = emails.map(hashEmail).filter(Boolean);
  if (!hashes.length) return new Set();
  const rows = await db.consentRecord.findMany({ where: { accountId, emailHash: { in: hashes } }, orderBy: { capturedAt: 'asc' }, select: { emailHash: true, status: true } });
  const latest = new Map();
  for (const r of rows) latest.set(r.emailHash, r.status);
  return new Set([...latest].filter(([, s]) => s === 'GRANTED').map(([h]) => h));
}
