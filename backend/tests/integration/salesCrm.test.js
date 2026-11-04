import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, resetDatabase, createAccount, createWorkspace } from '../helpers/testApp.js';

let ctx;
let ws2;
beforeAll(async () => {
  await resetDatabase();
  ctx = await createAccount('crm');
  ws2 = await createWorkspace(ctx, 'Europe Desk');
});
afterAll(() => prisma.$disconnect());

describe('leads', () => {
  it('creates with phone/timezone normalisation, score, tags, and blocks duplicates per Sales ID', async () => {
    const api = ctx.api(ctx.ws1.id);
    const res = await api.post('/api/v1/leads', { firstName: 'Anita', lastName: 'Rao', email: 'Anita@Example.com', phone: '+44 20 7946 0958', companyName: 'Rao Exports', source: 'Website', tags: ['hot', 'uk'] });
    expect(res.status).toBe(201);
    const lead = res.body.data;
    expect(lead).toMatchObject({ fullName: 'Anita Rao', email: 'anita@example.com', phoneE164: '+442079460958', countryCode: 'GB', timezone: 'Europe/London', timezoneSource: 'PHONE' });
    expect(lead.score).toBeGreaterThan(0);
    expect(lead.tags.map((t) => t.name).sort()).toEqual(['hot', 'uk']);

    const dup = await api.post('/api/v1/leads', { fullName: 'Again', email: 'anita@example.com' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_LEAD');
    // Another Sales ID may hold the same person.
    expect((await ctx.api(ws2.id).post('/api/v1/leads', { fullName: 'Anita R', email: 'anita@example.com' })).status).toBe(201);
  });

  it('lists with filters, search, pagination and scope', async () => {
    const api = ctx.api(ctx.ws1.id);
    await api.post('/api/v1/leads', { fullName: 'Bob Stone', email: 'bob@stone.test', status: 'QUALIFIED', source: 'Referral', countryCode: 'US' });
    const all = await ctx.api('all').get('/api/v1/leads?pageSize=50');
    expect(all.body.meta.total).toBe(3);
    const mine = await api.get('/api/v1/leads');
    expect(mine.body.meta.total).toBe(2);
    expect((await api.get('/api/v1/leads?status=QUALIFIED')).body.data.map((l) => l.fullName)).toEqual(['Bob Stone']);
    expect((await api.get('/api/v1/leads?q=stone')).body.meta.total).toBe(1);
    expect((await api.get('/api/v1/leads?tag=hot')).body.meta.total).toBe(1);
    expect((await api.get('/api/v1/leads?pageSize=1&page=2')).body.data).toHaveLength(1);
  });

  it('enforces write access: other Sales IDs cannot edit; shared READ cannot edit; COLLABORATE can', async () => {
    const lead = (await ctx.api(ctx.ws1.id).post('/api/v1/leads', { fullName: 'Shared Person' })).body.data;
    expect((await ctx.api(ws2.id).put(`/api/v1/leads/${lead.id}`, { status: 'CONTACTED' })).status).toBe(404);
    await ctx.api(ctx.ws1.id).post(`/api/v1/leads/${lead.id}/share`, { targetWorkspaceIds: [ws2.id], permission: 'READ' });
    expect((await ctx.api(ws2.id).get(`/api/v1/leads/${lead.id}`)).body.data.access).toBe('READ');
    const ro = await ctx.api(ws2.id).put(`/api/v1/leads/${lead.id}`, { status: 'CONTACTED' });
    expect(ro.status).toBe(403);
    await ctx.api(ctx.ws1.id).post(`/api/v1/leads/${lead.id}/share`, { targetWorkspaceIds: [ws2.id], permission: 'COLLABORATE' });
    const rw = await ctx.api(ws2.id).put(`/api/v1/leads/${lead.id}`, { status: 'CONTACTED' });
    expect(rw.status).toBe(200);
    expect((await ctx.api(ws2.id).delete(`/api/v1/leads/${lead.id}`)).status).toBe(403); // delete stays with owner
    const tl = await ctx.api(ctx.ws1.id).get(`/api/v1/leads/${lead.id}/timeline`);
    expect(tl.body.data.activities.map((a) => a.type)).toEqual(expect.arrayContaining(['STATUS_CHANGE', 'SHARE', 'SYSTEM']));
  });

  it('imports CSV (skips duplicates, reports bad rows) and exports CSV/XLSX', async () => {
    const csv = 'First Name,Last Name,Email,Phone,Country,Company,Source\nRavi,Kumar,ravi@kumar.test,+91 98765 43210,,Kumar Ltd,Expo\nDup,Lead,ravi@kumar.test,,,,\nBad,Email,not-an-email,,,,\nJane,Doe,jane@doe.test,,US,Doe Inc,\n';
    const res = await ctx.api(ctx.ws1.id).upload('/api/v1/leads/import', 'leads.csv', csv);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ createdCount: 2, skippedCount: 1, errorCount: 1 });
    const ravi = await prisma.lead.findFirst({ where: { emailNormalized: 'ravi@kumar.test' } });
    expect(ravi).toMatchObject({ countryCode: 'IN', timezone: 'Asia/Kolkata', phoneE164: '+919876543210', source: 'Expo' });

    const exp = await ctx.api(ctx.ws1.id).get('/api/v1/leads/export?format=csv');
    expect(exp.headers['content-type']).toMatch(/text\/csv/);
    expect(exp.text).toContain('ravi@kumar.test');
    expect(exp.text).not.toContain('Anita R,'); // other Sales ID's lead not exported
    const x = await ctx.api(ctx.ws1.id).get('/api/v1/leads/export?format=xlsx');
    expect(x.headers['content-type']).toMatch(/spreadsheetml/);
  });

  it('converts a lead into contact, company and deal', async () => {
    const lead = (await ctx.api(ctx.ws1.id).post('/api/v1/leads', { fullName: 'Convert Me', email: 'convert@me.test', companyName: 'ConvertCo' })).body.data;
    const res = await ctx.api(ctx.ws1.id).post(`/api/v1/leads/${lead.id}/convert`, { deal: { title: 'First order', amount: '125000.50', currency: 'INR' } });
    expect(res.status).toBe(200);
    const deal = await prisma.deal.findUnique({ where: { id: res.body.data.dealId } });
    expect(deal.amountMinor).toBe(12500050n);
    expect((await prisma.lead.findUnique({ where: { id: lead.id } })).status).toBe('CONVERTED');
    expect((await prisma.contact.findUnique({ where: { id: res.body.data.contactId } })).email).toBe('convert@me.test');
  });
});

describe('deals and pipeline', () => {
  it('creates in the default pipeline, moves on the board, and keeps currencies apart', async () => {
    const api = ctx.api(ctx.ws1.id);
    const a = (await api.post('/api/v1/deals', { title: 'INR deal', amount: '50000', currency: 'INR' })).body.data;
    await api.post('/api/v1/deals', { title: 'USD deal', amount: '1200.5', currency: 'USD' });
    expect(a.status).toBe('OPEN');
    const board = (await api.get('/api/v1/deals/board')).body.data;
    expect(board.stages).toHaveLength(7);
    const won = board.stages.find((s) => s.kind === 'WON');
    const moved = await api.post(`/api/v1/deals/${a.id}/move`, { stageId: won.id });
    expect(moved.body.data.status).toBe('WON');
    expect(moved.body.data.closedAt).toBeTruthy();
    const bad = await api.post('/api/v1/deals', { title: 'x', amount: '1.234', currency: 'INR' });
    expect(bad.status).toBe(400);
    const first = (await api.get('/api/v1/deals/board')).body.data.stages[0];
    expect(first.totals).toEqual(expect.arrayContaining([{ currency: 'USD', amountMinor: '120050' }]));
  });

  it('manages custom stages', async () => {
    const api = ctx.api(ctx.ws1.id);
    const [p] = (await api.get('/api/v1/pipelines')).body.data;
    const s = (await api.post(`/api/v1/pipelines/${p.id}/stages`, { name: 'Demo', probability: 50 })).body.data;
    expect(s.position).toBe(7);
    const del = await api.delete(`/api/v1/pipelines/${p.id}/stages/${s.id}`, {});
    expect(del.status).toBe(200);
  });
});

describe('tasks, notes, dashboard', () => {
  it('creates tasks linked to records, completes them and reports overdue', async () => {
    const api = ctx.api(ctx.ws1.id);
    const lead = (await api.get('/api/v1/leads?q=Bob')).body.data[0];
    const t = (await api.post('/api/v1/tasks', { title: 'Call Bob', type: 'CALL', leadId: lead.id, dueAt: new Date(Date.now() - 3600000).toISOString() })).body.data;
    expect((await api.get('/api/v1/tasks?due=overdue')).body.data.map((x) => x.id)).toContain(t.id);
    expect((await api.post(`/api/v1/tasks/${t.id}/complete`)).body.data.status).toBe('DONE');
    // A task cannot be linked to another Sales ID's record.
    const foreign = (await ctx.api(ws2.id).get('/api/v1/leads')).body.data.find((l) => l.ownerWorkspaceId === ws2.id && !l.isShared);
    expect((await api.post('/api/v1/tasks', { title: 'x', leadId: foreign.id })).status).toBe(404);
    const note = await api.post('/api/v1/notes', { entityType: 'LEAD', entityId: lead.id, body: 'Wants a demo' });
    expect(note.status).toBe(201);
  });

  it('returns dashboard numbers computed from the database', async () => {
    const res = await ctx.api(ctx.ws1.id).get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.sales.totals.leads).toBe(await prisma.lead.count({ where: { ownerWorkspaceId: ctx.ws1.id, deletedAt: null } }));
    expect(d.sales.wonRevenue).toEqual([{ currency: 'INR', amountMinor: '5000000', count: 1 }]);
    expect(d.comparison).toBeNull();
    const all = (await ctx.api('all').get('/api/v1/dashboard')).body.data;
    expect(all.comparison.map((c) => c.code)).toEqual(['SID-001', 'SID-002']);
    const rep = await ctx.api('all').get('/api/v1/reports/export?report=sales-ids&format=csv');
    expect(rep.text).toContain('SID-002');
  });
});
