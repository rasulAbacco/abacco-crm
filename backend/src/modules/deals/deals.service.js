import prisma from '../../prisma/client.js';
import { createRecordService } from '../../services/records/recordService.js';
import { toMinor } from '../../utils/money.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { getRecordAccess, assertCanEdit, buildScopeWhere } from '../../utils/scope.js';
import { resolveWriteWorkspace } from '../../middleware/salesIdMiddleware.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { DEFAULT_STAGES } from '../sales-ids/salesId.service.js';
import { publish } from '../../services/events/eventBus.js';

async function defaultCurrency(db, workspaceId) {
  const ws = await db.salesWorkspace.findUnique({ where: { id: workspaceId }, select: { defaultCurrency: true, account: { select: { defaultCurrency: true } } } });
  return ws.defaultCurrency ?? ws.account.defaultCurrency;
}

async function resolveStage(db, workspaceId, pipelineId, stageId) {
  if (stageId) {
    const stage = await db.pipelineStage.findUnique({ where: { id: stageId }, include: { pipeline: true } });
    if (!stage || stage.pipeline.workspaceId !== workspaceId || (pipelineId && stage.pipelineId !== pipelineId)) {
      throw new AppError(400, 'INVALID_STAGE', 'That stage is not part of this Sales ID\'s pipeline.');
    }
    return stage;
  }
  const pipeline = pipelineId
    ? await db.pipeline.findFirst({ where: { id: pipelineId, workspaceId }, include: { stages: { orderBy: { position: 'asc' } } } })
    : await db.pipeline.findFirst({ where: { workspaceId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { stages: { orderBy: { position: 'asc' } } } });
  if (!pipeline || !pipeline.stages.length) throw new AppError(400, 'NO_PIPELINE', 'This Sales ID has no pipeline stages.');
  return pipeline.stages.find((s) => s.kind === 'OPEN') ?? pipeline.stages[0];
}

function statusFields(stage, existing) {
  const status = stage.kind;
  return { status, closedAt: status === 'OPEN' ? null : existing?.status === status ? existing.closedAt : new Date() };
}

async function assertLinks(db, accountId, d) {
  for (const [key, model] of [['leadId', 'lead'], ['contactId', 'contact'], ['companyId', 'company']]) {
    if (d[key]) {
      const r = await db[model].findFirst({ where: { id: d[key], accountId, deletedAt: null }, select: { id: true } });
      if (!r) throw new AppError(400, 'INVALID_LINK', `The linked ${model} does not exist.`);
    }
  }
}

async function prepare({ input, scope, workspace, existing, db }) {
  const { amount, ...data } = input;
  const wsId = existing?.ownerWorkspaceId ?? workspace.id;
  await assertLinks(db, scope.accountId, data);
  const currency = data.currency ?? existing?.currency ?? (await defaultCurrency(db, wsId));
  data.currency = currency;
  if (amount !== undefined) data.amountMinor = toMinor(amount, currency) ?? 0n;
  else if (!existing) data.amountMinor = 0n;
  if (!existing || data.stageId || data.pipelineId) {
    const stage = await resolveStage(db, wsId, data.pipelineId ?? (data.stageId ? undefined : existing?.pipelineId), data.stageId ?? (data.pipelineId ? undefined : existing?.stageId));
    data.pipelineId = stage.pipelineId;
    data.stageId = stage.id;
    Object.assign(data, statusFields(stage, existing));
  }
  return data;
}

export const dealService = createRecordService({
  entityType: 'DEAL',
  searchFields: ['title', 'description'],
  sortable: ['createdAt', 'updatedAt', 'title', 'amountMinor', 'expectedCloseDate', 'status'],
  listInclude: { stage: { select: { id: true, name: true, kind: true } }, company: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } } },
  detailInclude: {
    stage: true,
    pipeline: { select: { id: true, name: true } },
    lead: { select: { id: true, fullName: true } },
    contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    company: { select: { id: true, name: true } },
    tasks: { where: { deletedAt: null }, select: { id: true, title: true, status: true, dueAt: true } },
  },
  prepare,
  titleOf: (r) => r.title,
  onUpdated: async (tx, before, after, ctx, scope) => {
    if (before.stageId !== after.stageId) {
      const stage = await tx.pipelineStage.findUnique({ where: { id: after.stageId } });
      await tx.activity.create({ data: { accountId: after.accountId, workspaceId: scope.workspaceId ?? after.ownerWorkspaceId, actorId: ctx.userId, dealId: after.id, type: 'STATUS_CHANGE', subject: `Moved to ${stage.name}` } });
    }
  },
});

export function dealFilters(q) {
  return {
    ...(q.status ? { status: q.status } : {}),
    ...(q.pipelineId ? { pipelineId: q.pipelineId } : {}),
    ...(q.stageId ? { stageId: q.stageId } : {}),
    ...(q.currency ? { currency: q.currency } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.contactId ? { contactId: q.contactId } : {}),
  };
}

// ---------------------------------------------------------------- Kanban

export async function board(scope, { pipelineId, q }) {
  let pipeline;
  if (pipelineId) {
    pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, accountId: scope.accountId } });
    if (!pipeline || (scope.mode === 'single' && pipeline.workspaceId !== scope.workspaceId)) throw notFound('Pipeline');
  } else {
    const wsId = scope.workspaceId ?? (await prisma.salesWorkspace.findFirst({ where: { accountId: scope.accountId, isDefault: true, deletedAt: null } }))?.id;
    pipeline = await prisma.pipeline.findFirst({ where: { workspaceId: wsId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  }
  if (!pipeline) throw notFound('Pipeline');
  const stages = await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { position: 'asc' } });
  const scopeWhere = await buildScopeWhere(scope, 'DEAL');
  const deals = await prisma.deal.findMany({
    where: { AND: [scopeWhere, { pipelineId: pipeline.id }, q ? { title: { contains: q, mode: 'insensitive' } } : {}] },
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    take: 2000,
    include: { company: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, ownerWorkspace: { select: { id: true, code: true } } },
  });
  return {
    pipeline,
    stages: stages.map((s) => {
      const items = deals.filter((d) => d.stageId === s.id);
      const totals = {};
      for (const d of items) totals[d.currency] = ((BigInt(totals[d.currency] ?? 0)) + d.amountMinor).toString();
      return { ...s, deals: items, count: items.length, totals: Object.entries(totals).map(([currency, amountMinor]) => ({ currency, amountMinor })) };
    }),
  };
}

export async function moveDeal(scope, id, { stageId, position, lostReason }, ctx) {
  const { record, access } = await getRecordAccess(scope, 'DEAL', id);
  assertCanEdit(access, 'deal');
  const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
  if (!stage || stage.pipelineId !== record.pipelineId) throw new AppError(400, 'INVALID_STAGE', 'That stage is not in this deal\'s pipeline.');
  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.deal.update({ where: { id }, data: { stageId, position: position ?? Date.now() / 1e6, ...statusFields(stage, record), ...(lostReason ? { lostReason } : {}) } });
    if (record.stageId !== stageId) {
      await tx.activity.create({ data: { accountId: record.accountId, workspaceId: scope.workspaceId ?? record.ownerWorkspaceId, actorId: ctx.userId, dealId: id, type: 'STATUS_CHANGE', subject: `Moved to ${stage.name}` } });
      await writeAudit({ accountId: record.accountId, workspaceId: record.ownerWorkspaceId, action: 'deal.move', entityType: 'DEAL', entityId: id, before: { stageId: record.stageId, status: record.status }, after: { stageId, status: d.status }, ctx }, tx);
    }
    return d;
  });
  if (record.status !== updated.status) publish('deal.status_changed', { accountId: record.accountId, workspaceId: record.ownerWorkspaceId, record: updated, from: record.status });
  return updated;
}

// ---------------------------------------------------------------- pipelines & stages

async function ownedPipeline(scope, id) {
  const p = await prisma.pipeline.findFirst({ where: { id, accountId: scope.accountId }, include: { workspace: { select: { id: true, code: true, name: true } } } });
  if (!p || (scope.mode === 'single' && p.workspaceId !== scope.workspaceId)) throw notFound('Pipeline');
  return p;
}

export async function listPipelines(scope, { workspaceId }) {
  const wsFilter = scope.mode === 'single' ? { workspaceId: scope.workspaceId } : workspaceId ? { workspaceId } : {};
  return prisma.pipeline.findMany({
    where: { accountId: scope.accountId, ...wsFilter, workspace: { deletedAt: null } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { stages: { orderBy: { position: 'asc' } }, workspace: { select: { id: true, code: true, name: true } } },
  });
}

export async function createPipeline(scope, { name, workspaceId, copyDefaultStages }, ctx) {
  const ws = await resolveWriteWorkspace(scope, workspaceId);
  const p = await prisma.pipeline.create({
    data: { accountId: scope.accountId, workspaceId: ws.id, name, stages: copyDefaultStages ? { create: DEFAULT_STAGES.map((s, position) => ({ ...s, position })) } : undefined },
    include: { stages: { orderBy: { position: 'asc' } } },
  });
  await writeAudit({ accountId: scope.accountId, workspaceId: ws.id, action: 'pipeline.create', entityType: 'Pipeline', entityId: p.id, after: { name }, ctx });
  return p;
}

export async function updatePipeline(scope, id, data, ctx) {
  const p = await ownedPipeline(scope, id);
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.pipeline.updateMany({ where: { workspaceId: p.workspaceId }, data: { isDefault: false } });
    const u = await tx.pipeline.update({ where: { id }, data });
    await writeAudit({ accountId: scope.accountId, workspaceId: p.workspaceId, action: 'pipeline.update', entityType: 'Pipeline', entityId: id, before: { name: p.name }, after: data, ctx }, tx);
    return u;
  });
}

export async function deletePipeline(scope, id, ctx) {
  const p = await ownedPipeline(scope, id);
  const deals = await prisma.deal.count({ where: { pipelineId: id } });
  if (deals) throw conflict(`Move or delete the ${deals} deal(s) in this pipeline first.`, 'PIPELINE_IN_USE');
  if ((await prisma.pipeline.count({ where: { workspaceId: p.workspaceId } })) <= 1) throw conflict('A Sales ID needs at least one pipeline.', 'LAST_PIPELINE');
  await prisma.pipeline.delete({ where: { id } });
  await writeAudit({ accountId: scope.accountId, workspaceId: p.workspaceId, action: 'pipeline.delete', entityType: 'Pipeline', entityId: id, before: { name: p.name }, ctx });
  return { deleted: true };
}

export async function addStage(scope, id, data, ctx) {
  const p = await ownedPipeline(scope, id);
  const max = await prisma.pipelineStage.aggregate({ where: { pipelineId: id }, _max: { position: true } });
  const s = await prisma.pipelineStage.create({ data: { ...data, pipelineId: id, position: (max._max.position ?? -1) + 1 } });
  await writeAudit({ accountId: scope.accountId, workspaceId: p.workspaceId, action: 'pipeline.stage_add', entityType: 'Pipeline', entityId: id, after: data, ctx });
  return s;
}

export async function updateStage(scope, id, stageId, data, ctx) {
  const p = await ownedPipeline(scope, id);
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId: id } });
  if (!stage) throw notFound('Stage');
  return prisma.$transaction(async (tx) => {
    const s = await tx.pipelineStage.update({ where: { id: stageId }, data });
    if (data.kind && data.kind !== stage.kind) {
      await tx.deal.updateMany({ where: { stageId }, data: { status: data.kind, closedAt: data.kind === 'OPEN' ? null : new Date() } });
    }
    await writeAudit({ accountId: scope.accountId, workspaceId: p.workspaceId, action: 'pipeline.stage_update', entityType: 'Pipeline', entityId: id, before: stage, after: data, ctx }, tx);
    return s;
  });
}

export async function reorderStages(scope, id, stageIds, ctx) {
  const p = await ownedPipeline(scope, id);
  const stages = await prisma.pipelineStage.findMany({ where: { pipelineId: id }, select: { id: true } });
  if (stages.length !== stageIds.length || !stages.every((s) => stageIds.includes(s.id))) throw new AppError(400, 'INVALID_ORDER', 'Send every stage of the pipeline exactly once.');
  await prisma.$transaction(stageIds.map((sid, position) => prisma.pipelineStage.update({ where: { id: sid }, data: { position } })));
  await writeAudit({ accountId: scope.accountId, workspaceId: p.workspaceId, action: 'pipeline.stage_reorder', entityType: 'Pipeline', entityId: id, ctx });
  return prisma.pipelineStage.findMany({ where: { pipelineId: id }, orderBy: { position: 'asc' } });
}

export async function deleteStage(scope, id, stageId, { moveToStageId }, ctx) {
  const p = await ownedPipeline(scope, id);
  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId: id } });
  if (!stage) throw notFound('Stage');
  const deals = await prisma.deal.count({ where: { stageId } });
  return prisma.$transaction(async (tx) => {
    if (deals) {
      const target = moveToStageId && (await tx.pipelineStage.findFirst({ where: { id: moveToStageId, pipelineId: id, NOT: { id: stageId } } }));
      if (!target) throw conflict(`This stage has ${deals} deal(s). Choose a stage to move them to.`, 'STAGE_IN_USE', { deals });
      await tx.deal.updateMany({ where: { stageId }, data: { stageId: target.id, status: target.kind, closedAt: target.kind === 'OPEN' ? null : new Date() } });
    }
    await tx.pipelineStage.delete({ where: { id: stageId } });
    await writeAudit({ accountId: scope.accountId, workspaceId: p.workspaceId, action: 'pipeline.stage_delete', entityType: 'Pipeline', entityId: id, before: { name: stage.name }, metadata: { movedDeals: deals }, ctx }, tx);
    return { deleted: true, movedDeals: deals };
  });
}
