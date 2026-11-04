import prisma from '../../prisma/client.js';
import { DateTime } from 'luxon';
import { resolveWriteWorkspace } from '../../middleware/salesIdMiddleware.js';
import { getRecordAccess } from '../../utils/scope.js';
import { notFound } from '../../utils/errors.js';
import { toOrderBy, toSkipTake } from '../../utils/pagination.js';
import { writeAudit } from '../../services/audit/auditService.js';

const LINKS = [['leadId', 'LEAD'], ['contactId', 'CONTACT'], ['companyId', 'COMPANY'], ['dealId', 'DEAL']];
const INCLUDE = {
  lead: { select: { id: true, fullName: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, name: true } },
  deal: { select: { id: true, title: true } },
  ownerWorkspace: { select: { id: true, code: true, name: true } },
};

const scopeWhere = (scope) => ({ accountId: scope.accountId, deletedAt: null, ...(scope.mode === 'single' ? { ownerWorkspaceId: scope.workspaceId } : {}) });

async function checkLinks(scope, data) {
  for (const [key, type] of LINKS) if (data[key]) await getRecordAccess(scope, type, data[key]);
}

async function find(scope, id) {
  const t = await prisma.task.findFirst({ where: { id, ...scopeWhere(scope) } });
  if (!t) throw notFound('Task');
  return t;
}

export async function listTasks(scope, q, userTz = 'Asia/Kolkata') {
  const now = new Date();
  const startOfDay = DateTime.now().setZone(userTz).startOf('day').toJSDate();
  const endOfDay = DateTime.now().setZone(userTz).endOf('day').toJSDate();
  const and = [scopeWhere(scope)];
  if (q.status) and.push({ status: { in: q.status.split(',') } });
  if (q.priority) and.push({ priority: q.priority });
  if (q.type) and.push({ type: q.type });
  if (q.due === 'overdue') and.push({ dueAt: { lt: now }, status: { in: ['TODO', 'IN_PROGRESS'] } });
  if (q.due === 'today') and.push({ dueAt: { gte: startOfDay, lte: endOfDay } });
  if (q.due === 'upcoming') and.push({ dueAt: { gt: endOfDay } });
  if (q.due === 'none') and.push({ dueAt: null });
  if (q.from || q.to) and.push({ dueAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } });
  for (const [key] of LINKS) if (q[key]) and.push({ [key]: q[key] });
  if (q.q) and.push({ title: { contains: q.q, mode: 'insensitive' } });
  const where = { AND: and };
  const [items, total] = await Promise.all([
    prisma.task.findMany({ where, include: INCLUDE, orderBy: [toOrderBy(q.sort, ['dueAt', 'createdAt', 'priority', 'title', 'status'], { dueAt: 'asc' })], ...toSkipTake(q) }),
    prisma.task.count({ where }),
  ]);
  return { items, total };
}

export async function getTask(scope, id) {
  await find(scope, id);
  return prisma.task.findUnique({ where: { id }, include: INCLUDE });
}

export async function createTask(scope, body, ctx) {
  const { ownerWorkspaceId, ...data } = body;
  const ws = await resolveWriteWorkspace(scope, ownerWorkspaceId);
  await checkLinks(scope, data);
  const t = await prisma.task.create({ data: { ...data, accountId: scope.accountId, ownerWorkspaceId: ws.id, completedAt: data.status === 'DONE' ? new Date() : null }, include: INCLUDE });
  await writeAudit({ accountId: scope.accountId, workspaceId: ws.id, action: 'task.create', entityType: 'Task', entityId: t.id, after: { title: t.title }, ctx });
  return t;
}

export async function updateTask(scope, id, data, ctx) {
  const before = await find(scope, id);
  await checkLinks(scope, data);
  const patch = { ...data };
  if (data.status) patch.completedAt = data.status === 'DONE' ? before.completedAt ?? new Date() : null;
  if (data.remindAt !== undefined) patch.reminderSentAt = null;
  const t = await prisma.task.update({ where: { id }, data: patch, include: INCLUDE });
  if (data.status === 'DONE' && before.status !== 'DONE') {
    const fk = LINKS.find(([k]) => t[k]);
    if (fk) await prisma.activity.create({ data: { accountId: t.accountId, workspaceId: t.ownerWorkspaceId, actorId: ctx.userId, type: 'TASK', subject: `Task completed: ${t.title}`, [fk[0]]: t[fk[0]] } });
  }
  await writeAudit({ accountId: scope.accountId, workspaceId: t.ownerWorkspaceId, action: 'task.update', entityType: 'Task', entityId: id, before: { status: before.status, dueAt: before.dueAt }, after: data, ctx });
  return t;
}

export async function deleteTask(scope, id, ctx) {
  const t = await find(scope, id);
  await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ accountId: scope.accountId, workspaceId: t.ownerWorkspaceId, action: 'task.delete', entityType: 'Task', entityId: id, before: { title: t.title }, ctx });
  return { deleted: true };
}

export async function bulkStatus(scope, ids, status, ctx) {
  const r = await prisma.task.updateMany({ where: { id: { in: ids }, ...scopeWhere(scope) }, data: { status, completedAt: status === 'DONE' ? new Date() : null } });
  await writeAudit({ accountId: scope.accountId, workspaceId: scope.workspaceId, action: 'task.bulk_status', entityType: 'Task', metadata: { ids, status }, ctx });
  return { updated: r.count };
}
