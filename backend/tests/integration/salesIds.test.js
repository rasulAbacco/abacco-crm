import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, resetDatabase, createAccount, createWorkspace, makeLead, makeContact, makeDeal } from '../helpers/testApp.js';

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('Sales ID management', () => {
  it('creates Sales IDs with sequential codes, settings and a default pipeline', async () => {
    const ctx = await createAccount('sid');
    const a = await createWorkspace(ctx, 'North America');
    const b = await createWorkspace(ctx, 'Europe');
    expect(a.code).toBe('SID-002');
    expect(b.code).toBe('SID-003');
    expect(await prisma.pipelineStage.count({ where: { pipeline: { workspaceId: a.id } } })).toBe(7);
    expect(await prisma.salesWorkspaceSettings.count({ where: { workspaceId: a.id } })).toBe(1);

    const dup = await ctx.api().post('/api/v1/sales-ids', { name: 'Europe' });
    expect(dup.status).toBe(409);
    expect(await prisma.auditLog.count({ where: { action: 'sales_id.create', accountId: ctx.account.id } })).toBe(2);
  });

  it('lists with statistics and search', async () => {
    const ctx = await createAccount('stats');
    const ws2 = await createWorkspace(ctx, 'India Enterprise');
    await makeLead(ctx.account.id, ctx.ws1.id);
    await makeLead(ctx.account.id, ctx.ws1.id);
    await makeLead(ctx.account.id, ws2.id);
    await makeDeal(ctx.account.id, ctx.ws1.id, 'Proposal', { amountMinor: 500000n, currency: 'INR' });
    await makeDeal(ctx.account.id, ctx.ws1.id, 'Proposal', { amountMinor: 20000n, currency: 'USD' });

    const res = await ctx.api().get('/api/v1/sales-ids');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    const s1 = res.body.data.find((w) => w.code === 'SID-001').stats;
    expect(s1.leads).toBe(2);
    expect(s1.openDeals).toBe(2);
    // Currencies are reported separately, never summed.
    expect(s1.pipelineValue).toEqual(expect.arrayContaining([{ currency: 'INR', amountMinor: '500000' }, { currency: 'USD', amountMinor: '20000' }]));

    const search = await ctx.api().get('/api/v1/sales-ids?q=enterprise');
    expect(search.body.data.map((w) => w.code)).toEqual(['SID-002']);
  });

  it('keeps exactly one default and protects it', async () => {
    const ctx = await createAccount('default');
    const ws2 = await createWorkspace(ctx, 'Second');

    const deactivateDefault = await ctx.api().patch(`/api/v1/sales-ids/${ctx.ws1.id}/status`, { status: 'INACTIVE' });
    expect(deactivateDefault.status).toBe(409);

    expect((await ctx.api().post(`/api/v1/sales-ids/${ws2.id}/default`)).status).toBe(200);
    const defaults = await prisma.salesWorkspace.findMany({ where: { accountId: ctx.account.id, isDefault: true } });
    expect(defaults.map((d) => d.id)).toEqual([ws2.id]);

    expect((await ctx.api().patch(`/api/v1/sales-ids/${ctx.ws1.id}/status`, { status: 'INACTIVE' })).status).toBe(200);
    expect((await ctx.api().post(`/api/v1/sales-ids/${ctx.ws1.id}/default`)).status).toBe(409);
  });

  it('rejects another account\'s Sales ID in X-Sales-Id and in management routes', async () => {
    const mine = await createAccount('mine');
    const theirs = await createAccount('theirs');
    const res = await mine.api(theirs.ws1.id).get('/api/v1/audit-logs');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SALES_ID_FORBIDDEN');
    expect((await mine.api().get(`/api/v1/sales-ids/${theirs.ws1.id}`)).status).toBe(404);
    expect((await mine.api().put(`/api/v1/sales-ids/${theirs.ws1.id}`, { name: 'Hijack' })).status).toBe(404);
    expect((await mine.api('not-a-uuid').get('/api/v1/audit-logs')).status).toBe(400);
  });

  it('deletes only with confirmation, moves owned records, and never reuses the code', async () => {
    const ctx = await createAccount('delete');
    const ws2 = await createWorkspace(ctx, 'Closing');
    const ws3 = await createWorkspace(ctx, 'Receiving');
    const lead = await makeLead(ctx.account.id, ws2.id);
    await makeContact(ctx.account.id, ws2.id, { email: 'same@example.test' });
    await makeDeal(ctx.account.id, ws2.id);

    expect((await ctx.api().delete(`/api/v1/sales-ids/${ws2.id}`, { confirmCode: 'WRONG' })).status).toBe(400);
    const needsTarget = await ctx.api().delete(`/api/v1/sales-ids/${ws2.id}`, { confirmCode: ws2.code });
    expect(needsTarget.status).toBe(409);
    expect(needsTarget.body.error.code).toBe('TRANSFER_TARGET_REQUIRED');
    expect(needsTarget.body.error.details.counts.lead).toBe(1);

    // A clash in the target blocks the whole delete and changes nothing.
    await makeContact(ctx.account.id, ws3.id, { email: 'same@example.test' });
    const clash = await ctx.api().delete(`/api/v1/sales-ids/${ws2.id}`, { confirmCode: ws2.code, transferToId: ws3.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error.details.contacts).toEqual(['same@example.test']);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } })).ownerWorkspaceId).toBe(ws2.id);

    await prisma.contact.deleteMany({ where: { ownerWorkspaceId: ws3.id } });
    const del = await ctx.api().delete(`/api/v1/sales-ids/${ws2.id}`, { confirmCode: ws2.code, transferToId: ws3.id });
    expect(del.status).toBe(200);
    expect(del.body.data.moved).toMatchObject({ lead: 1, contact: 1, deal: 1 });
    expect((await prisma.lead.findUnique({ where: { id: lead.id } })).ownerWorkspaceId).toBe(ws3.id);
    expect(await prisma.recordTransferHistory.count({ where: { fromWorkspaceId: ws2.id } })).toBe(3);

    const deal = await prisma.deal.findFirst({ where: { ownerWorkspaceId: ws3.id }, include: { pipeline: true } });
    expect(deal.pipeline.workspaceId).toBe(ws3.id); // pipeline travelled with the deal

    const list = await ctx.api().get('/api/v1/sales-ids');
    expect(list.body.data.map((w) => w.code)).not.toContain(ws2.code);
    const next = await createWorkspace(ctx, 'Closing'); // name is free again
    expect(next.code).toBe('SID-004');
  });
});
