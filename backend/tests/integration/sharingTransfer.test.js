import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, resetDatabase, createAccount, createWorkspace, makeLead, makeContact, makeCompany, makeDeal } from '../helpers/testApp.js';
import { buildScopeWhere, getRecordAccess, assertCanEdit } from '../../src/utils/scope.js';

let ctx;
let ws2;
let ws3;

beforeAll(resetDatabase);
beforeEach(async () => {
  ctx = await createAccount();
  ws2 = await createWorkspace(ctx, `Second ${Date.now()}`);
  ws3 = await createWorkspace(ctx, `Third ${Date.now()}`);
});
afterAll(() => prisma.$disconnect());

const scopeOf = (accountId, workspaceId) =>
  workspaceId ? { accountId, mode: 'single', workspaceId } : { accountId, mode: 'all', workspaceId: null };

async function visibleLeadIds(accountId, workspaceId) {
  const where = await buildScopeWhere(scopeOf(accountId, workspaceId), 'LEAD');
  return (await prisma.lead.findMany({ where, select: { id: true } })).map((l) => l.id).sort();
}

describe('data isolation', () => {
  it('a Sales ID sees only its own records; All sees everything in the account', async () => {
    const a = await makeLead(ctx.account.id, ctx.ws1.id);
    const b = await makeLead(ctx.account.id, ws2.id);
    const other = await createAccount('stranger');
    await makeLead(other.account.id, other.ws1.id);

    expect(await visibleLeadIds(ctx.account.id, ctx.ws1.id)).toEqual([a.id]);
    expect(await visibleLeadIds(ctx.account.id, ws2.id)).toEqual([b.id]);
    expect(await visibleLeadIds(ctx.account.id, null)).toEqual([a.id, b.id].sort());

    // Another Sales ID — and another account — get 404, not 403, so existence is not revealed.
    expect((await ctx.api(ws2.id).get(`/api/v1/records/leads/${a.id}/shares`)).status).toBe(404);
    expect((await other.api().get(`/api/v1/records/leads/${a.id}/shares`)).status).toBe(404);
  });

  it('soft-deleted records are invisible', async () => {
    const a = await makeLead(ctx.account.id, ctx.ws1.id, { deletedAt: new Date() });
    expect(await visibleLeadIds(ctx.account.id, ctx.ws1.id)).not.toContain(a.id);
  });
});

describe('sharing', () => {
  it('grants read access without duplicating rows, then revokes it', async () => {
    const lead = await makeLead(ctx.account.id, ctx.ws1.id);
    const url = `/api/v1/records/leads/${lead.id}/shares`;

    const share = await ctx.api(ctx.ws1.id).post(url, { targetWorkspaceIds: [ws2.id], permission: 'READ' });
    expect(share.status).toBe(200);
    expect(share.body.data[0].outcome).toBe('shared');
    expect(await visibleLeadIds(ctx.account.id, ws2.id)).toEqual([lead.id]);

    const view = await ctx.api(ws2.id).get(url);
    expect(view.status).toBe(200);
    expect(view.body.data.yourAccess).toBe('READ');
    expect(view.body.data.owner.id).toBe(ctx.ws1.id); // original owner stays identifiable

    const again = await ctx.api(ctx.ws1.id).post(url, { targetWorkspaceIds: [ws2.id, ws2.id], permission: 'READ' });
    expect(again.body.data[0].outcome).toBe('already_shared');
    expect(await prisma.recordShare.count({ where: { entityId: lead.id } })).toBe(1);

    // Read-only holders cannot edit, re-share or transfer.
    const { access } = await getRecordAccess(scopeOf(ctx.account.id, ws2.id), 'LEAD', lead.id);
    expect(() => assertCanEdit(access)).toThrow(/read-only/);
    const reshare = await ctx.api(ws2.id).post(url, { targetWorkspaceIds: [ws3.id] });
    expect(reshare.status).toBe(403);
    expect(reshare.body.error.code).toBe('NOT_OWNER');
    expect((await ctx.api(ws2.id).post(`/api/v1/records/leads/${lead.id}/transfer`, { targetWorkspaceId: ws3.id })).status).toBe(403);

    const upgrade = await ctx.api(ctx.ws1.id).patch(`${url}/${ws2.id}`, { permission: 'COLLABORATE' });
    expect(upgrade.body.data.outcome).toBe('permission_changed');
    const after = await getRecordAccess(scopeOf(ctx.account.id, ws2.id), 'LEAD', lead.id);
    expect(after.access).toBe('COLLABORATE');

    expect((await ctx.api(ctx.ws1.id).delete(`${url}/${ws2.id}`)).status).toBe(200);
    expect(await visibleLeadIds(ctx.account.id, ws2.id)).toEqual([]);
    expect((await ctx.api(ws2.id).get(url)).status).toBe(404);

    const reshared = await ctx.api(ctx.ws1.id).post(url, { targetWorkspaceIds: [ws2.id] });
    expect(reshared.body.data[0].outcome).toBe('reshared');
    expect(await prisma.recordShare.count({ where: { entityId: lead.id } })).toBe(1);

    const actions = (await prisma.auditLog.findMany({ where: { entityId: lead.id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['record.share', 'record.share', 'record.share_revoke', 'record.share']);
    expect(await prisma.activity.count({ where: { leadId: lead.id, type: 'SHARE' } })).toBe(4);
  });

  it('refuses to share with the owner or with an inactive Sales ID', async () => {
    const lead = await makeLead(ctx.account.id, ctx.ws1.id);
    const url = `/api/v1/records/leads/${lead.id}/shares`;
    expect((await ctx.api().post(url, { targetWorkspaceIds: [ctx.ws1.id] })).status).toBe(400);
    await ctx.api().patch(`/api/v1/sales-ids/${ws3.id}/status`, { status: 'INACTIVE' });
    const res = await ctx.api().post(url, { targetWorkspaceIds: [ws3.id] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SALES_ID_INACTIVE');
  });
});

describe('transfer', () => {
  it('moves ownership and keeps notes, activities and history', async () => {
    const lead = await makeLead(ctx.account.id, ctx.ws1.id);
    await prisma.note.create({ data: { accountId: ctx.account.id, workspaceId: ctx.ws1.id, leadId: lead.id, body: 'Called, interested' } });
    await prisma.activity.create({ data: { accountId: ctx.account.id, workspaceId: ctx.ws1.id, leadId: lead.id, type: 'CALL', subject: 'Intro call' } });
    const task = await prisma.task.create({ data: { accountId: ctx.account.id, ownerWorkspaceId: ctx.ws1.id, leadId: lead.id, title: 'Follow up' } });
    await ctx.api(ctx.ws1.id).post(`/api/v1/records/leads/${lead.id}/shares`, { targetWorkspaceIds: [ws2.id, ws3.id] });

    const res = await ctx.api(ctx.ws1.id).post(`/api/v1/records/leads/${lead.id}/transfer`, { targetWorkspaceId: ws2.id, reason: 'Territory change', shareBack: 'READ' });
    expect(res.status).toBe(200);
    expect(res.body.data.cascaded.tasks).toBe(1);

    expect((await prisma.lead.findUnique({ where: { id: lead.id } })).ownerWorkspaceId).toBe(ws2.id);
    expect(await prisma.lead.count({ where: { accountId: ctx.account.id } })).toBe(1); // no duplicate created
    expect((await prisma.task.findUnique({ where: { id: task.id } })).ownerWorkspaceId).toBe(ws2.id);
    expect(await prisma.note.count({ where: { leadId: lead.id } })).toBe(1);
    expect(await prisma.activity.count({ where: { leadId: lead.id, type: 'CALL' } })).toBe(1);

    const shares = await prisma.recordShare.findMany({ where: { entityId: lead.id, revokedAt: null } });
    expect(shares.map((s) => s.targetWorkspaceId).sort()).toEqual([ctx.ws1.id, ws3.id].sort()); // ws2 is now owner; ws1 kept read access
    expect(shares.every((s) => s.ownerWorkspaceId === ws2.id)).toBe(true);

    const history = await ctx.api(ws2.id).get(`/api/v1/records/leads/${lead.id}/transfers`);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({ reason: 'Territory change', fromWorkspace: { id: ctx.ws1.id }, toWorkspace: { id: ws2.id } });
    expect(await prisma.auditLog.count({ where: { entityId: lead.id, action: 'record.transfer' } })).toBe(1);

    // The old owner now has read-only access.
    const old = await getRecordAccess(scopeOf(ctx.account.id, ctx.ws1.id), 'LEAD', lead.id);
    expect(old.access).toBe('READ');
  });

  it('refuses a transfer that would duplicate a contact in the target', async () => {
    const c = await makeContact(ctx.account.id, ctx.ws1.id, { email: 'Dup@Example.test' });
    await makeContact(ctx.account.id, ws2.id, { email: 'dup@example.test' });
    const res = await ctx.api().post(`/api/v1/records/contacts/${c.id}/transfer`, { targetWorkspaceId: ws2.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRANSFER_DUPLICATE');
    expect((await prisma.contact.findUnique({ where: { id: c.id } })).ownerWorkspaceId).toBe(ctx.ws1.id);
    expect(await prisma.recordTransferHistory.count({ where: { entityId: c.id } })).toBe(0);
  });

  it('places a transferred deal in the matching stage of the target pipeline', async () => {
    const deal = await makeDeal(ctx.account.id, ctx.ws1.id, 'Negotiation');
    const res = await ctx.api().post(`/api/v1/records/deals/${deal.id}/transfer`, { targetWorkspaceId: ws2.id });
    expect(res.status).toBe(200);
    const moved = await prisma.deal.findUnique({ where: { id: deal.id }, include: { stage: true, pipeline: true } });
    expect(moved.pipeline.workspaceId).toBe(ws2.id);
    expect(moved.stage.name).toBe('Negotiation');
    expect(moved.amountMinor).toBe(1250000n);
  });

  it('cascades contacts and deals with a company when asked', async () => {
    const company = await makeCompany(ctx.account.id, ctx.ws1.id, 'Globex');
    const contact = await makeContact(ctx.account.id, ctx.ws1.id, { companyId: company.id });
    const deal = await makeDeal(ctx.account.id, ctx.ws1.id, 'Qualified', { companyId: company.id });
    const res = await ctx.api().post(`/api/v1/records/companies/${company.id}/transfer`, { targetWorkspaceId: ws3.id, cascade: { contacts: true, deals: true } });
    expect(res.status).toBe(200);
    expect(res.body.data.cascaded).toMatchObject({ contacts: 1, deals: 1 });
    for (const [model, id] of [['company', company.id], ['contact', contact.id], ['deal', deal.id]]) {
      expect((await prisma[model].findUnique({ where: { id } })).ownerWorkspaceId).toBe(ws3.id);
    }
    expect(await prisma.recordTransferHistory.count({ where: { toWorkspaceId: ws3.id } })).toBe(3);
  });

  it('two simultaneous transfers of one record cannot both win', async () => {
    const lead = await makeLead(ctx.account.id, ctx.ws1.id);
    const url = `/api/v1/records/leads/${lead.id}/transfer`;
    const [a, b] = await Promise.all([ctx.api().post(url, { targetWorkspaceId: ws2.id }), ctx.api().post(url, { targetWorkspaceId: ws3.id })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.recordTransferHistory.count({ where: { entityId: lead.id } })).toBe(1);
  });

  it('bulk transfer reports per-record failures without stopping', async () => {
    const ok1 = await makeLead(ctx.account.id, ctx.ws1.id);
    const ok2 = await makeLead(ctx.account.id, ctx.ws1.id);
    const alreadyThere = await makeLead(ctx.account.id, ws2.id);
    const res = await ctx.api().post('/api/v1/records/leads/bulk-transfer', { ids: [ok1.id, ok2.id, alreadyThere.id], targetWorkspaceId: ws2.id });
    expect(res.status).toBe(200);
    expect(res.body.data.succeeded.map((s) => s.id).sort()).toEqual([ok1.id, ok2.id].sort());
    expect(res.body.data.failed).toEqual([expect.objectContaining({ id: alreadyThere.id, code: 'SAME_SALES_ID' })]);
  });
});
