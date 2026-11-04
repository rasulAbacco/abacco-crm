import prisma from '../../prisma/client.js';
import { suppress } from '../../services/email/suppressionService.js';
import { toSkipTake } from '../../utils/pagination.js';
import { conflict, notFound } from '../../utils/errors.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { hashEmail } from '../../utils/normalize.js';

export async function list(accountId, q) {
  const where = { accountId, ...(q.reason ? { reason: q.reason } : {}), ...(q.q ? { OR: [{ emailNormalized: { contains: q.q.toLowerCase() } }, { emailHash: hashEmail(q.q) ?? '' }] } : {}) };
  const [items, total, byReason] = await Promise.all([
    prisma.suppression.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
    prisma.suppression.count({ where }),
    prisma.suppression.groupBy({ by: ['reason'], where: { accountId }, _count: { _all: true } }),
  ]);
  return { items, total, summary: Object.fromEntries(byReason.map((r) => [r.reason, r._count._all])) };
}

export async function add(accountId, { emails, note }, ctx) {
  let added = 0;
  for (const e of new Set(emails)) {
    const before = await prisma.suppression.count({ where: { accountId, emailHash: hashEmail(e) } });
    await suppress(accountId, e, { reason: 'MANUAL', source: 'MANUAL', note });
    if (!before) added++;
  }
  await writeAudit({ accountId, action: 'suppression.add', entityType: 'Suppression', metadata: { count: added }, ctx });
  return { added };
}

// Unsubscribes, complaints and erasures cannot be undone from here: the person must opt in again.
export async function remove(accountId, id, ctx) {
  const s = await prisma.suppression.findFirst({ where: { id, accountId } });
  if (!s) throw notFound('Suppression');
  if (['UNSUBSCRIBED', 'COMPLAINT', 'ERASURE'].includes(s.reason)) {
    throw conflict('Unsubscribes, spam complaints and erasure requests cannot be removed. The person has to opt in again.', 'PROTECTED_SUPPRESSION');
  }
  await prisma.suppression.delete({ where: { id } });
  await writeAudit({ accountId, action: 'suppression.remove', entityType: 'Suppression', entityId: id, before: { reason: s.reason }, ctx });
  return { deleted: true };
}

export async function unsubscribes(accountId, q) {
  const where = { accountId };
  const [items, total] = await Promise.all([
    prisma.unsubscribe.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q), include: { workspace: { select: { code: true, name: true } } } }),
    prisma.unsubscribe.count({ where }),
  ]);
  return { items, total };
}
