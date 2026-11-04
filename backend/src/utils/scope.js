// Sales ID data isolation. Every query for a shareable record goes through
// buildScopeWhere; every single-record read/write goes through getRecordAccess.
//
//   scope "all"      → every live record of the account (the primary user owns them all)
//   scope Sales ID W → records owned by W  +  records actively shared with W
import prisma from '../prisma/client.js';
import { forbidden, notFound } from './errors.js';

export const ENTITY_MODEL = {
  LEAD: 'lead',
  CONTACT: 'contact',
  COMPANY: 'company',
  DEAL: 'deal',
};

export const ENTITY_LABEL = { LEAD: 'Lead', CONTACT: 'Contact', COMPANY: 'Company', DEAL: 'Deal' };

export function modelFor(entityType, db = prisma) {
  const name = ENTITY_MODEL[entityType];
  if (!name) throw new Error(`Unsupported entity type ${entityType}`);
  return db[name];
}

export async function sharedIdsFor(scope, entityType, db = prisma) {
  const rows = await db.recordShare.findMany({
    where: { accountId: scope.accountId, targetWorkspaceId: scope.workspaceId, entityType, revokedAt: null },
    select: { entityId: true },
  });
  return rows.map((r) => r.entityId);
}

export async function buildScopeWhere(scope, entityType, db = prisma) {
  const base = { accountId: scope.accountId, deletedAt: null };
  if (scope.mode === 'all') return base;
  const shared = await sharedIdsFor(scope, entityType, db);
  if (shared.length === 0) return { ...base, ownerWorkspaceId: scope.workspaceId };
  return { ...base, OR: [{ ownerWorkspaceId: scope.workspaceId }, { id: { in: shared } }] };
}

/**
 * Loads one record and works out what the current scope may do with it.
 * access: ACCOUNT (All Sales IDs view) | OWNER | COLLABORATE | READ
 * Records outside the scope answer 404 so their existence is not revealed.
 */
export async function getRecordAccess(scope, entityType, id, { db = prisma, select } = {}) {
  const record = await modelFor(entityType, db).findFirst({
    where: { id, accountId: scope.accountId, deletedAt: null },
    ...(select ? { select: { ...select, id: true, ownerWorkspaceId: true, accountId: true } } : {}),
  });
  if (!record) throw notFound(ENTITY_LABEL[entityType]);

  if (scope.mode === 'all') return { record, access: 'ACCOUNT' };
  if (record.ownerWorkspaceId === scope.workspaceId) return { record, access: 'OWNER' };

  const share = await db.recordShare.findUnique({
    where: { entityType_entityId_targetWorkspaceId: { entityType, entityId: id, targetWorkspaceId: scope.workspaceId } },
    select: { permission: true, revokedAt: true },
  });
  if (!share || share.revokedAt) throw notFound(ENTITY_LABEL[entityType]);
  return { record, access: share.permission };
}

export function canEdit(access) {
  return access === 'ACCOUNT' || access === 'OWNER' || access === 'COLLABORATE';
}

// Sharing, transferring and deleting stay with the owner (or the All view).
export function canManage(access) {
  return access === 'ACCOUNT' || access === 'OWNER';
}

export function assertCanEdit(access, label = 'record') {
  if (!canEdit(access)) throw forbidden(`This ${label} is shared with read-only access.`, 'READ_ONLY_SHARE');
}

export function assertCanManage(access, label = 'record') {
  if (!canManage(access)) {
    throw forbidden(`Only the owning Sales ID can share, transfer or delete this ${label}.`, 'NOT_OWNER');
  }
}
