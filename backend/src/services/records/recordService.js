// Shared, scope-enforcing CRUD for the four shareable record types.
// Each module supplies its own validation and a `prepare` hook for its fields;
// this service applies Sales ID scope, tags, activity, audit and soft delete
// identically everywhere.
import prisma from '../../prisma/client.js';
import { buildScopeWhere, getRecordAccess, assertCanEdit, assertCanManage, modelFor, ENTITY_LABEL } from '../../utils/scope.js';
import { resolveWriteWorkspace } from '../../middleware/salesIdMiddleware.js';
import { toOrderBy, toSkipTake } from '../../utils/pagination.js';
import { writeAudit } from '../audit/auditService.js';
import { setTags, tagsFor, idsWithTag } from './tagService.js';
import { publish } from '../events/eventBus.js';
import { notFound } from '../../utils/errors.js';

const WS = { select: { id: true, code: true, name: true } };
const PARENT_FK = { LEAD: 'leadId', CONTACT: 'contactId', COMPANY: 'companyId', DEAL: 'dealId' };

function diff(before, after) {
  const changed = {};
  for (const k of Object.keys(after)) {
    if (['updatedAt'].includes(k)) continue;
    const a = before?.[k];
    const b = after[k];
    if (JSON.stringify(a, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) !== JSON.stringify(b, (_, v) => (typeof v === 'bigint' ? v.toString() : v))) {
      changed[k] = { from: a ?? null, to: b ?? null };
    }
  }
  return changed;
}

export function createRecordService(cfg) {
  const { entityType, searchFields, sortable, listInclude = {}, detailInclude = {}, prepare, onCreated, onUpdated, titleOf } = cfg;
  const label = ENTITY_LABEL[entityType];
  const model = (db = prisma) => modelFor(entityType, db);

  async function listWhere(scope, q, filterWhere = {}) {
    const and = [await buildScopeWhere(scope, entityType), filterWhere];
    if (q.q && searchFields.length) and.push({ OR: searchFields.map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } })) });
    if (q.tag) and.push({ id: { in: await idsWithTag(scope.accountId, entityType, q.tag) } });
    if (q.ownerWorkspaceId) and.push({ ownerWorkspaceId: q.ownerWorkspaceId });
    if (q.from || q.to) and.push({ createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } });
    return { AND: and };
  }

  async function decorate(scope, items) {
    const tags = await tagsFor(entityType, items.map((i) => i.id));
    return items.map((i) => ({
      ...i,
      tags: tags.get(i.id) ?? [],
      isShared: scope.mode === 'single' && i.ownerWorkspaceId !== scope.workspaceId,
    }));
  }

  return {
    entityType,
    listWhere,

    async list(scope, q, filterWhere) {
      const where = await listWhere(scope, q, filterWhere);
      const [items, total] = await Promise.all([
        model().findMany({ where, include: { ownerWorkspace: WS, ...listInclude }, orderBy: [toOrderBy(q.sort, sortable)], ...toSkipTake(q) }),
        model().count({ where }),
      ]);
      return { items: await decorate(scope, items), total };
    },

    async exportRows(scope, q, filterWhere, max = 50000) {
      const where = await listWhere(scope, q, filterWhere);
      const items = await model().findMany({ where, include: { ownerWorkspace: WS, ...listInclude }, orderBy: [toOrderBy(q.sort, sortable)], take: max });
      return decorate(scope, items);
    },

    async get(scope, id) {
      const { access } = await getRecordAccess(scope, entityType, id);
      const record = await model().findUnique({ where: { id }, include: { ownerWorkspace: WS, ...detailInclude } });
      const [tags, shares] = await Promise.all([
        tagsFor(entityType, [id]),
        prisma.recordShare.findMany({ where: { entityType, entityId: id, revokedAt: null }, select: { permission: true, targetWorkspace: WS } }),
      ]);
      return { ...record, tags: tags.get(id) ?? [], shares, access };
    },

    async create(scope, body, ctx) {
      const { tags, ownerWorkspaceId, ...input } = body;
      const ws = await resolveWriteWorkspace(scope, ownerWorkspaceId);
      const data = await prepare({ input, scope, workspace: ws, db: prisma });
      const record = await prisma.$transaction(async (tx) => {
        const created = await model(tx).create({ data: { ...data, accountId: scope.accountId, ownerWorkspaceId: ws.id } });
        await setTags(tx, scope.accountId, entityType, created.id, tags);
        await tx.activity.create({
          data: { accountId: scope.accountId, workspaceId: ws.id, actorId: ctx.userId, type: 'SYSTEM', subject: `${label} created`, [PARENT_FK[entityType]]: created.id },
        });
        await writeAudit({ accountId: scope.accountId, workspaceId: ws.id, action: `${entityType.toLowerCase()}.create`, entityType, entityId: created.id, after: created, ctx }, tx);
        if (onCreated) await onCreated(tx, created, ctx);
        return created;
      });
      publish(`${entityType.toLowerCase()}.created`, { accountId: scope.accountId, workspaceId: ws.id, record });
      return this.get(scope, record.id);
    },

    async update(scope, id, body, ctx) {
      const { record: before, access } = await getRecordAccess(scope, entityType, id);
      assertCanEdit(access, label.toLowerCase());
      const { tags, ownerWorkspaceId: _ignored, ...input } = body;
      const data = await prepare({ input, scope, existing: before, db: prisma, isUpdate: true });
      const after = await prisma.$transaction(async (tx) => {
        const updated = await model(tx).update({ where: { id }, data });
        await setTags(tx, scope.accountId, entityType, id, tags);
        const changes = diff(before, data);
        if (Object.keys(changes).length) {
          await writeAudit({ accountId: scope.accountId, workspaceId: scope.workspaceId ?? before.ownerWorkspaceId, action: `${entityType.toLowerCase()}.update`, entityType, entityId: id, before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])), after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])), ctx }, tx);
        }
        if (onUpdated) await onUpdated(tx, before, updated, ctx, scope);
        return updated;
      });
      if (before.status !== undefined && after.status !== before.status) {
        publish(`${entityType.toLowerCase()}.status_changed`, { accountId: scope.accountId, workspaceId: after.ownerWorkspaceId, record: after, from: before.status });
      }
      return this.get(scope, id);
    },

    async remove(scope, id, ctx) {
      const { record, access } = await getRecordAccess(scope, entityType, id);
      assertCanManage(access, label.toLowerCase());
      await prisma.$transaction(async (tx) => {
        await model(tx).update({ where: { id }, data: { deletedAt: new Date() } });
        await tx.recordShare.updateMany({ where: { entityType, entityId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: ctx.userId } });
        await writeAudit({ accountId: scope.accountId, workspaceId: record.ownerWorkspaceId, action: `${entityType.toLowerCase()}.delete`, entityType, entityId: id, before: { title: titleOf?.(record) }, ctx }, tx);
      });
      return { deleted: true };
    },

    async bulkDelete(scope, ids, ctx) {
      const succeeded = [];
      const failed = [];
      for (const id of [...new Set(ids)]) {
        try {
          await this.remove(scope, id, ctx);
          succeeded.push(id);
        } catch (err) {
          if (!err.expose) throw err;
          failed.push({ id, code: err.code, message: err.message });
        }
      }
      return { succeeded, failed };
    },

    async bulkUpdate(scope, ids, patch, ctx) {
      const succeeded = [];
      const failed = [];
      for (const id of [...new Set(ids)]) {
        try {
          await this.update(scope, id, patch, ctx);
          succeeded.push(id);
        } catch (err) {
          if (!err.expose) throw err;
          failed.push({ id, code: err.code, message: err.message });
        }
      }
      return { succeeded, failed };
    },

    async timeline(scope, id) {
      await getRecordAccess(scope, entityType, id);
      const fk = PARENT_FK[entityType];
      const [notes, activities, transfers] = await Promise.all([
        prisma.note.findMany({ where: { [fk]: id, deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { author: { select: { id: true, name: true } }, workspace: WS } }),
        prisma.activity.findMany({ where: { [fk]: id }, orderBy: { occurredAt: 'desc' }, take: 200, include: { actor: { select: { id: true, name: true } }, workspace: WS } }),
        prisma.recordTransferHistory.findMany({ where: { entityType, entityId: id }, orderBy: { createdAt: 'desc' }, include: { fromWorkspace: WS, toWorkspace: WS } }),
      ]);
      return { notes, activities, transfers };
    },

    async assertExists(scope, id) {
      const r = await model().findFirst({ where: { id, accountId: scope.accountId, deletedAt: null }, select: { id: true } });
      if (!r) throw notFound(label);
    },
  };
}
