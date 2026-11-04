import prisma from '../../prisma/client.js';
import { toSkipTake } from '../../utils/pagination.js';

// Read-only audit trail. With a Sales ID selected, only that Sales ID's entries.
export async function listAuditLogs(scope, q) {
  const where = {
    accountId: scope.accountId,
    ...(scope.mode === 'single' ? { workspaceId: scope.workspaceId } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(q),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
        workspace: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
