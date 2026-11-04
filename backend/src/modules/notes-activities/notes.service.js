import prisma from '../../prisma/client.js';
import { getRecordAccess, assertCanEdit } from '../../utils/scope.js';
import { notFound } from '../../utils/errors.js';
import { writeAudit } from '../../services/audit/auditService.js';

const FK = { LEAD: 'leadId', CONTACT: 'contactId', COMPANY: 'companyId', DEAL: 'dealId' };

async function parentAccess(scope, entityType, entityId) {
  const { record, access } = await getRecordAccess(scope, entityType, entityId);
  assertCanEdit(access, entityType.toLowerCase());
  return { record, workspaceId: scope.workspaceId ?? record.ownerWorkspaceId };
}

export async function createNote(scope, { entityType, entityId, body }, ctx) {
  const { workspaceId } = await parentAccess(scope, entityType, entityId);
  const note = await prisma.note.create({ data: { accountId: scope.accountId, workspaceId, authorId: ctx.userId, body, [FK[entityType]]: entityId }, include: { author: { select: { id: true, name: true } } } });
  if (entityType === 'LEAD') await prisma.lead.update({ where: { id: entityId }, data: { lastActivityAt: new Date() } });
  return note;
}

async function findNote(scope, id) {
  const note = await prisma.note.findFirst({ where: { id, accountId: scope.accountId, deletedAt: null } });
  if (!note) throw notFound('Note');
  const type = Object.keys(FK).find((t) => note[FK[t]]);
  await parentAccess(scope, type, note[FK[type]]);
  return note;
}

export async function updateNote(scope, id, { body }, ctx) {
  const note = await findNote(scope, id);
  const u = await prisma.note.update({ where: { id }, data: { body } });
  await writeAudit({ accountId: scope.accountId, workspaceId: note.workspaceId, action: 'note.update', entityType: 'Note', entityId: id, ctx });
  return u;
}

export async function deleteNote(scope, id, ctx) {
  const note = await findNote(scope, id);
  await prisma.note.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ accountId: scope.accountId, workspaceId: note.workspaceId, action: 'note.delete', entityType: 'Note', entityId: id, ctx });
  return { deleted: true };
}

export async function logActivity(scope, { entityType, entityId, type, subject, body, occurredAt }, ctx) {
  const { workspaceId } = await parentAccess(scope, entityType, entityId);
  const a = await prisma.activity.create({ data: { accountId: scope.accountId, workspaceId, actorId: ctx.userId, type, subject, body, occurredAt: occurredAt ?? new Date(), [FK[entityType]]: entityId } });
  if (entityType === 'LEAD') await prisma.lead.update({ where: { id: entityId }, data: { lastActivityAt: new Date(), ...(type !== 'NOTE' ? {} : {}) } });
  if (entityType === 'CONTACT') await prisma.contact.update({ where: { id: entityId }, data: { lastContactedAt: new Date() } });
  return a;
}

export async function recentActivities(scope, limit = 20) {
  return prisma.activity.findMany({
    where: { accountId: scope.accountId, ...(scope.mode === 'single' ? { workspaceId: scope.workspaceId } : {}) },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    include: { actor: { select: { name: true } }, workspace: { select: { code: true } }, lead: { select: { id: true, fullName: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, company: { select: { id: true, name: true } }, deal: { select: { id: true, title: true } } },
  });
}
