import prisma from '../../prisma/client.js';
import { resolveWriteWorkspace } from '../../middleware/salesIdMiddleware.js';
import { buildScopeWhere } from '../../utils/scope.js';
import { conflict, notFound } from '../../utils/errors.js';
import { toOrderBy, toSkipTake } from '../../utils/pagination.js';
import { normalizeEmail } from '../../utils/normalize.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { publish } from '../../services/events/eventBus.js';
import { idsWithTag } from '../../services/records/tagService.js';
import { countryTimezoneMap } from '../../utils/intl.js';

const scopeWhere = (scope) => ({ accountId: scope.accountId, deletedAt: null, ...(scope.mode === 'single' ? { ownerWorkspaceId: scope.workspaceId } : {}) });

export async function findList(scope, id) {
  const l = await prisma.emailList.findFirst({ where: { id, ...scopeWhere(scope) }, include: { ownerWorkspace: { select: { id: true, code: true, name: true } } } });
  if (!l) throw notFound('Email list');
  return l;
}

async function counts(listIds) {
  const rows = await prisma.emailListContact.groupBy({ by: ['listId', 'status'], where: { listId: { in: listIds } }, _count: { _all: true } });
  const out = {};
  for (const r of rows) (out[r.listId] ??= { SUBSCRIBED: 0, UNSUBSCRIBED: 0, BOUNCED: 0, REMOVED: 0 })[r.status] = r._count._all;
  return out;
}

export async function listLists(scope, q) {
  const where = { ...scopeWhere(scope), ...(q.ownerWorkspaceId ? { ownerWorkspaceId: q.ownerWorkspaceId } : {}), ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}) };
  const [items, total] = await Promise.all([
    prisma.emailList.findMany({ where, include: { ownerWorkspace: { select: { id: true, code: true, name: true } } }, orderBy: [toOrderBy(q.sort, ['name', 'createdAt'])], ...toSkipTake(q) }),
    prisma.emailList.count({ where }),
  ]);
  const c = await counts(items.map((i) => i.id));
  return { items: items.map((i) => ({ ...i, counts: c[i.id] ?? { SUBSCRIBED: 0, UNSUBSCRIBED: 0, BOUNCED: 0, REMOVED: 0 } })), total };
}

export async function getList(scope, id) {
  const l = await findList(scope, id);
  const c = await counts([id]);
  return { ...l, counts: c[id] ?? { SUBSCRIBED: 0, UNSUBSCRIBED: 0, BOUNCED: 0, REMOVED: 0 } };
}

export async function createList(scope, { ownerWorkspaceId, ...data }, ctx) {
  const ws = await resolveWriteWorkspace(scope, ownerWorkspaceId);
  const l = await prisma.emailList.create({ data: { ...data, accountId: scope.accountId, ownerWorkspaceId: ws.id } });
  await writeAudit({ accountId: scope.accountId, workspaceId: ws.id, action: 'list.create', entityType: 'EmailList', entityId: l.id, after: data, ctx });
  return l;
}

export async function updateList(scope, id, data, ctx) {
  const l = await findList(scope, id);
  const u = await prisma.emailList.update({ where: { id }, data });
  await writeAudit({ accountId: scope.accountId, workspaceId: l.ownerWorkspaceId, action: 'list.update', entityType: 'EmailList', entityId: id, before: { name: l.name }, after: data, ctx });
  return u;
}

export async function deleteList(scope, id, ctx) {
  const l = await findList(scope, id);
  const active = await prisma.campaignList.count({ where: { listId: id, campaign: { status: { in: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'] } } } });
  if (active) throw conflict('This list is used by an active campaign.', 'LIST_IN_USE');
  await prisma.emailList.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ accountId: scope.accountId, workspaceId: l.ownerWorkspaceId, action: 'list.delete', entityType: 'EmailList', entityId: id, before: { name: l.name }, ctx });
  return { deleted: true };
}

export async function members(scope, id, q) {
  await findList(scope, id);
  const where = {
    listId: id,
    ...(q.status ? { status: q.status } : {}),
    contact: {
      deletedAt: null,
      ...(q.countryCode ? { countryCode: q.countryCode } : {}),
      ...(q.q ? { OR: ['firstName', 'lastName', 'email'].map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } })) } : {}),
    },
  };
  const [items, total] = await Promise.all([
    prisma.emailListContact.findMany({ where, orderBy: { addedAt: 'desc' }, ...toSkipTake(q), include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, countryCode: true, timezone: true, ownerWorkspaceId: true } } } }),
    prisma.emailListContact.count({ where }),
  ]);
  return { items, total };
}

async function addContactIds(list, ids) {
  if (!ids.length) return 0;
  const r = await prisma.emailListContact.createMany({ data: ids.map((contactId) => ({ listId: list.id, contactId, source: 'manual' })), skipDuplicates: true });
  return r.count;
}

export async function addMembers(scope, id, { contactIds = [], emails = [] }, ctx) {
  const list = await findList(scope, id);
  // Contacts must be visible to the selected scope (owned or shared).
  const where = await buildScopeWhere(scope, 'CONTACT');
  const allowed = contactIds.length ? await prisma.contact.findMany({ where: { AND: [where, { id: { in: contactIds } }, { emailNormalized: { not: null } }] }, select: { id: true } }) : [];
  const ids = allowed.map((c) => c.id);
  let created = 0;
  if (emails.length) {
    const tz = await countryTimezoneMap(prisma, scope.accountId);
    for (const e of emails) {
      const emailNormalized = normalizeEmail(e.email);
      let c = await prisma.contact.findFirst({ where: { ownerWorkspaceId: list.ownerWorkspaceId, emailNormalized, deletedAt: null }, select: { id: true } });
      if (!c) {
        c = await prisma.contact.create({ data: { accountId: scope.accountId, ownerWorkspaceId: list.ownerWorkspaceId, email: emailNormalized, emailNormalized, firstName: e.firstName, lastName: e.lastName, countryCode: e.countryCode, timezone: e.countryCode ? tz[e.countryCode] ?? null : null, timezoneSource: e.countryCode && tz[e.countryCode] ? 'COUNTRY' : 'DEFAULT', source: 'List' } });
        created++;
      }
      ids.push(c.id);
    }
  }
  // Re-adding someone who unsubscribed does not resubscribe them.
  const added = await addContactIds(list, [...new Set(ids)]);
  await writeAudit({ accountId: scope.accountId, workspaceId: list.ownerWorkspaceId, action: 'list.add_members', entityType: 'EmailList', entityId: id, metadata: { added, createdContacts: created, rejected: contactIds.length - allowed.length }, ctx });
  if (added) publish('list.joined', { accountId: scope.accountId, workspaceId: list.ownerWorkspaceId, listId: id, contactIds: ids });
  return { added, createdContacts: created, skipped: contactIds.length - allowed.length };
}

export async function addSegment(scope, id, seg, ctx) {
  await findList(scope, id);
  const and = [await buildScopeWhere(scope, 'CONTACT'), { emailNormalized: { not: null } }];
  if (seg.countryCodes?.length) and.push({ countryCode: { in: seg.countryCodes } });
  if (seg.sources?.length) and.push({ source: { in: seg.sources } });
  if (seg.companyId) and.push({ companyId: seg.companyId });
  for (const t of seg.tags ?? []) and.push({ id: { in: await idsWithTag(scope.accountId, 'CONTACT', t) } });
  const contacts = await prisma.contact.findMany({ where: { AND: and }, select: { id: true }, take: 50000 });
  return addMembers(scope, id, { contactIds: contacts.map((c) => c.id) }, ctx);
}

export async function removeMembers(scope, id, { contactIds }, ctx) {
  const list = await findList(scope, id);
  const r = await prisma.emailListContact.updateMany({ where: { listId: id, contactId: { in: contactIds }, status: 'SUBSCRIBED' }, data: { status: 'REMOVED' } });
  await writeAudit({ accountId: scope.accountId, workspaceId: list.ownerWorkspaceId, action: 'list.remove_members', entityType: 'EmailList', entityId: id, metadata: { removed: r.count }, ctx });
  return { removed: r.count };
}

export async function exportMembers(scope, id, status) {
  await findList(scope, id);
  return prisma.emailListContact.findMany({ where: { listId: id, ...(status ? { status } : {}), contact: { deletedAt: null } }, include: { contact: true }, take: 100000 });
}
