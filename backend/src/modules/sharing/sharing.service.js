// Controlled sharing and transfer of sales records between Sales IDs.
//
// Share:    the record keeps its owner; RecordShare rows grant other Sales IDs
//           READ or COLLABORATE access. One row per (record, target) — re-sharing
//           reactivates or updates it, never duplicates it.
// Transfer: ownership moves in one transaction with the record row locked.
//           Notes and activities stay attached; history, activity and audit
//           entries are written; existing shares follow the record.
import prisma from '../../prisma/client.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { ENTITY_LABEL, assertCanManage, getRecordAccess, modelFor } from '../../utils/scope.js';
import { writeAudit } from '../../services/audit/auditService.js';

const TABLE = { LEAD: 'leads', CONTACT: 'contacts', COMPANY: 'companies', DEAL: 'deals' };
const PARENT_FK = { LEAD: 'leadId', CONTACT: 'contactId', COMPANY: 'companyId', DEAL: 'dealId' };
const WS_SELECT = { id: true, code: true, name: true, status: true };

function recordTitle(entityType, r) {
  if (entityType === 'DEAL') return r.title;
  if (entityType === 'COMPANY') return r.name;
  if (entityType === 'LEAD') return r.fullName;
  return [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || 'Contact';
}

async function lockRecord(tx, entityType, id) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT id, "ownerWorkspaceId" FROM ${TABLE[entityType]} WHERE id = $1::uuid AND "deletedAt" IS NULL FOR UPDATE`,
    id,
  );
  if (!rows.length) throw notFound(ENTITY_LABEL[entityType]);
  return rows[0];
}

async function loadTargets(db, accountId, ids) {
  const unique = [...new Set(ids)];
  const rows = await db.salesWorkspace.findMany({ where: { id: { in: unique }, accountId, deletedAt: null }, select: WS_SELECT });
  if (rows.length !== unique.length) throw new AppError(400, 'INVALID_SALES_ID', 'One or more Sales IDs do not exist.');
  const inactive = rows.filter((w) => w.status !== 'ACTIVE');
  if (inactive.length) {
    throw conflict(`Sales ID ${inactive.map((w) => w.code).join(', ')} is not active.`, 'SALES_ID_INACTIVE');
  }
  return rows;
}

function activityData(entityType, record, workspaceId, actorId, type, subject, metadata) {
  return {
    accountId: record.accountId,
    workspaceId,
    actorId,
    type,
    subject,
    metadata,
    [PARENT_FK[entityType]]: record.id,
  };
}

// ---------------------------------------------------------------- shares

export async function listShares(scope, entityType, id) {
  const { record, access } = await getRecordAccess(scope, entityType, id);
  const [owner, shares] = await Promise.all([
    prisma.salesWorkspace.findUnique({ where: { id: record.ownerWorkspaceId }, select: WS_SELECT }),
    prisma.recordShare.findMany({
      where: { entityType, entityId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, permission: true, createdAt: true, updatedAt: true, revokedAt: true, targetWorkspace: { select: WS_SELECT } },
    }),
  ]);
  return {
    owner,
    yourAccess: access,
    active: shares.filter((s) => !s.revokedAt),
    revoked: shares.filter((s) => s.revokedAt),
  };
}

export async function shareRecord(scope, entityType, id, { targetWorkspaceIds, permission }, ctx) {
  const { record, access } = await getRecordAccess(scope, entityType, id);
  assertCanManage(access, ENTITY_LABEL[entityType].toLowerCase());
  if (targetWorkspaceIds.includes(record.ownerWorkspaceId)) {
    throw new AppError(400, 'SHARE_WITH_OWNER', 'A record cannot be shared with the Sales ID that owns it.');
  }
  const targets = await loadTargets(prisma, scope.accountId, targetWorkspaceIds);

  return prisma.$transaction(async (tx) => {
    const locked = await lockRecord(tx, entityType, id);
    if (locked.ownerWorkspaceId !== record.ownerWorkspaceId) throw conflict('This record was just transferred. Reload and try again.', 'OWNER_CHANGED');

    const results = [];
    for (const target of targets) {
      const key = { entityType_entityId_targetWorkspaceId: { entityType, entityId: id, targetWorkspaceId: target.id } };
      const existing = await tx.recordShare.findUnique({ where: key });
      let outcome;
      if (!existing) {
        await tx.recordShare.create({
          data: { accountId: scope.accountId, entityType, entityId: id, ownerWorkspaceId: record.ownerWorkspaceId, targetWorkspaceId: target.id, permission, createdById: ctx.userId },
        });
        outcome = 'shared';
      } else if (existing.revokedAt) {
        await tx.recordShare.update({ where: key, data: { revokedAt: null, revokedById: null, permission, ownerWorkspaceId: record.ownerWorkspaceId, createdById: ctx.userId } });
        outcome = 'reshared';
      } else if (existing.permission !== permission) {
        await tx.recordShare.update({ where: key, data: { permission } });
        outcome = 'permission_changed';
      } else {
        outcome = 'already_shared';
      }
      results.push({ workspace: target, permission, outcome });
    }

    const changed = results.filter((r) => r.outcome !== 'already_shared');
    if (changed.length) {
      const names = changed.map((r) => r.workspace.code).join(', ');
      await tx.activity.create({
        data: activityData(entityType, record, record.ownerWorkspaceId, ctx.userId, 'SHARE', `Shared with ${names} (${permission.toLowerCase()})`, {
          targets: changed.map((r) => ({ id: r.workspace.id, code: r.workspace.code, outcome: r.outcome })),
          permission,
        }),
      });
      await writeAudit(
        { accountId: scope.accountId, workspaceId: record.ownerWorkspaceId, action: 'record.share', entityType, entityId: id, after: { permission, targets: changed.map((r) => r.workspace.id) }, metadata: { outcomes: results.map((r) => r.outcome) }, ctx },
        tx,
      );
    }
    return results;
  });
}

export async function revokeShare(scope, entityType, id, targetWorkspaceId, ctx) {
  const { record, access } = await getRecordAccess(scope, entityType, id);
  assertCanManage(access, ENTITY_LABEL[entityType].toLowerCase());
  const key = { entityType_entityId_targetWorkspaceId: { entityType, entityId: id, targetWorkspaceId } };
  const share = await prisma.recordShare.findUnique({ where: key, include: { targetWorkspace: { select: WS_SELECT } } });
  if (!share || share.revokedAt) throw notFound('Active share');

  return prisma.$transaction(async (tx) => {
    await tx.recordShare.update({ where: key, data: { revokedAt: new Date(), revokedById: ctx.userId } });
    await tx.activity.create({
      data: activityData(entityType, record, record.ownerWorkspaceId, ctx.userId, 'SHARE', `Stopped sharing with ${share.targetWorkspace.code}`, { revoked: targetWorkspaceId }),
    });
    await writeAudit({ accountId: scope.accountId, workspaceId: record.ownerWorkspaceId, action: 'record.share_revoke', entityType, entityId: id, before: { targetWorkspaceId, permission: share.permission }, ctx }, tx);
    return { revoked: true, workspace: share.targetWorkspace };
  });
}

// ---------------------------------------------------------------- transfer

// A deal must sit in a pipeline of its owning Sales ID: keep the stage with the
// same name in the target's default pipeline, else the same kind, else the first stage.
async function mapDealStage(tx, deal, toWorkspaceId) {
  const pipeline = await tx.pipeline.findFirst({
    where: { workspaceId: toWorkspaceId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { stages: { orderBy: { position: 'asc' } } },
  });
  if (!pipeline || pipeline.stages.length === 0) {
    throw conflict('The target Sales ID has no pipeline stages to place this deal in.', 'NO_PIPELINE');
  }
  const current = await tx.pipelineStage.findUnique({ where: { id: deal.stageId } });
  const stage =
    pipeline.stages.find((s) => s.name.toLowerCase() === current?.name.toLowerCase()) ??
    pipeline.stages.find((s) => s.kind === current?.kind) ??
    pipeline.stages[0];
  return { pipelineId: pipeline.id, stageId: stage.id, stageName: stage.name };
}

async function assertNoDuplicate(tx, entityType, record, toWorkspaceId, toCode) {
  if (entityType === 'CONTACT' && record.emailNormalized) {
    const dup = await tx.contact.findFirst({ where: { ownerWorkspaceId: toWorkspaceId, emailNormalized: record.emailNormalized, deletedAt: null, NOT: { id: record.id } }, select: { id: true } });
    if (dup) throw conflict(`Sales ID ${toCode} already has a contact with ${record.email}. Merge them instead of transferring.`, 'TRANSFER_DUPLICATE', { existingId: dup.id });
  }
  if (entityType === 'COMPANY') {
    const dup = await tx.company.findFirst({ where: { ownerWorkspaceId: toWorkspaceId, nameNormalized: record.nameNormalized, deletedAt: null, NOT: { id: record.id } }, select: { id: true } });
    if (dup) throw conflict(`Sales ID ${toCode} already has a company named ${record.name}.`, 'TRANSFER_DUPLICATE', { existingId: dup.id });
  }
}

// Moves one record (already locked) and keeps its shares consistent.
async function moveRecord(tx, { entityType, record, from, to, reason, userId, cascaded }) {
  await assertNoDuplicate(tx, entityType, record, to.id, to.code);
  const data = { ownerWorkspaceId: to.id };
  let stageNote = null;
  if (entityType === 'DEAL') {
    const mapped = await mapDealStage(tx, record, to.id);
    data.pipelineId = mapped.pipelineId;
    data.stageId = mapped.stageId;
    stageNote = mapped.stageName;
  }
  await modelFor(entityType, tx).update({ where: { id: record.id }, data });

  // The new owner no longer needs a share; other shares now belong to the new owner.
  await tx.recordShare.deleteMany({ where: { entityType, entityId: record.id, targetWorkspaceId: to.id } });
  await tx.recordShare.updateMany({ where: { entityType, entityId: record.id }, data: { ownerWorkspaceId: to.id } });

  await tx.recordTransferHistory.create({
    data: { accountId: record.accountId, entityType, entityId: record.id, fromWorkspaceId: from.id, toWorkspaceId: to.id, reason, performedById: userId, cascaded },
  });
  await tx.activity.create({
    data: activityData(entityType, record, to.id, userId, 'TRANSFER', `Transferred from ${from.code} to ${to.code}`, {
      from: { id: from.id, code: from.code },
      to: { id: to.id, code: to.code },
      reason: reason ?? null,
      ...(stageNote ? { stage: stageNote } : {}),
    }),
  });
}

export async function transferRecord(scope, entityType, id, input, ctx) {
  const { targetWorkspaceId, reason, shareBack } = input;
  const cascade = { tasks: true, deals: false, contacts: false, ...(input.cascade ?? {}) };
  const { record, access } = await getRecordAccess(scope, entityType, id);
  assertCanManage(access, ENTITY_LABEL[entityType].toLowerCase());
  if (record.ownerWorkspaceId === targetWorkspaceId) {
    throw new AppError(400, 'SAME_SALES_ID', 'The record already belongs to that Sales ID.');
  }
  const [to] = await loadTargets(prisma, scope.accountId, [targetWorkspaceId]);

  return prisma.$transaction(
    async (tx) => {
      const locked = await lockRecord(tx, entityType, id);
      if (locked.ownerWorkspaceId !== record.ownerWorkspaceId) throw conflict('This record was just transferred. Reload and try again.', 'OWNER_CHANGED');
      const fresh = await modelFor(entityType, tx).findUnique({ where: { id } });
      const from = await tx.salesWorkspace.findUnique({ where: { id: fresh.ownerWorkspaceId }, select: WS_SELECT });

      const summary = { tasks: 0, deals: 0, contacts: 0 };

      // Related records that the old owner holds can move along.
      if (cascade.contacts && entityType === 'COMPANY') {
        const contacts = await tx.contact.findMany({ where: { companyId: id, ownerWorkspaceId: from.id, deletedAt: null } });
        for (const c of contacts) {
          await lockRecord(tx, 'CONTACT', c.id);
          await moveRecord(tx, { entityType: 'CONTACT', record: c, from, to, reason: `With company ${fresh.name}`, userId: ctx.userId });
        }
        summary.contacts = contacts.length;
      }
      if (cascade.deals && entityType !== 'DEAL') {
        const deals = await tx.deal.findMany({ where: { [PARENT_FK[entityType]]: id, ownerWorkspaceId: from.id, deletedAt: null } });
        for (const d of deals) {
          await lockRecord(tx, 'DEAL', d.id);
          await moveRecord(tx, { entityType: 'DEAL', record: d, from, to, reason: `With ${ENTITY_LABEL[entityType].toLowerCase()} ${recordTitle(entityType, fresh)}`, userId: ctx.userId });
        }
        summary.deals = deals.length;
      }
      if (cascade.tasks) {
        const r = await tx.task.updateMany({ where: { [PARENT_FK[entityType]]: id, ownerWorkspaceId: from.id, deletedAt: null }, data: { ownerWorkspaceId: to.id } });
        summary.tasks = r.count;
      }

      await moveRecord(tx, { entityType, record: fresh, from, to, reason, userId: ctx.userId, cascaded: summary });

      if (shareBack) {
        await tx.recordShare.upsert({
          where: { entityType_entityId_targetWorkspaceId: { entityType, entityId: id, targetWorkspaceId: from.id } },
          create: { accountId: scope.accountId, entityType, entityId: id, ownerWorkspaceId: to.id, targetWorkspaceId: from.id, permission: shareBack, createdById: ctx.userId },
          update: { revokedAt: null, revokedById: null, permission: shareBack, ownerWorkspaceId: to.id },
        });
      }

      await writeAudit(
        { accountId: scope.accountId, workspaceId: to.id, action: 'record.transfer', entityType, entityId: id, before: { ownerWorkspaceId: from.id }, after: { ownerWorkspaceId: to.id }, metadata: { reason: reason ?? null, cascade, cascaded: summary, shareBack: shareBack ?? null }, ctx },
        tx,
      );
      return { id, from, to, cascaded: summary, sharedBack: shareBack ?? null };
    },
    { timeout: 30_000 },
  );
}

export async function bulk(scope, entityType, ids, action, input, ctx) {
  const succeeded = [];
  const failed = [];
  for (const id of [...new Set(ids)]) {
    try {
      const result = action === 'share' ? await shareRecord(scope, entityType, id, input, ctx) : await transferRecord(scope, entityType, id, input, ctx);
      succeeded.push({ id, result });
    } catch (err) {
      if (!err.expose) throw err;
      failed.push({ id, code: err.code, message: err.message });
    }
  }
  return { succeeded, failed };
}

export async function transferHistory(scope, entityType, id) {
  await getRecordAccess(scope, entityType, id);
  return prisma.recordTransferHistory.findMany({
    where: { accountId: scope.accountId, entityType, entityId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reason: true,
      cascaded: true,
      createdAt: true,
      fromWorkspace: { select: WS_SELECT },
      toWorkspace: { select: WS_SELECT },
      performedBy: { select: { id: true, name: true } },
    },
  });
}
