// Append-only audit trail. Pass the transaction client (tx) when the audited
// change runs in a transaction so both commit or roll back together.
import prisma from '../../prisma/client.js';

const SENSITIVE = /password|secret|token|credential|ciphertext/i;

function scrub(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(scrub);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE.test(k)) continue;
    out[k] = typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : scrub(v);
  }
  return out;
}

export function requestContext(req) {
  return {
    userId: req.user?.id ?? null,
    ip: req.ip ?? null,
    userAgent: req.get?.('user-agent')?.slice(0, 300) ?? null,
    requestId: req.id ?? null,
  };
}

export async function writeAudit(
  { accountId, workspaceId = null, action, entityType, entityId = null, before, after, metadata, ctx = {} },
  db = prisma,
) {
  return db.auditLog.create({
    data: {
      accountId,
      workspaceId,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      before: before === undefined ? undefined : scrub(before),
      after: after === undefined ? undefined : scrub(after),
      metadata: metadata === undefined ? undefined : scrub(metadata),
      userId: ctx.userId ?? null,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      requestId: ctx.requestId ?? null,
    },
  });
}

export default writeAudit;
