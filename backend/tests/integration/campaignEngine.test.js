// End-to-end campaign tests against a local fake SMTP server (no real email).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { SMTPServer } from 'smtp-server';
import { app, prisma, resetDatabase, createAccount } from '../helpers/testApp.js';
import { dispatchTick, processRecipient } from '../../src/modules/campaign/campaign.worker.js';
import { computeSendTime } from '../../src/modules/campaign/campaign.scheduler.js';
import { handleSesNotification } from '../../src/modules/tracking/tracking.service.js';
import { automationTick } from '../../src/modules/automations/automations.worker.js';
import { registerAutomationTriggers } from '../../src/modules/automations/automations.triggers.js';

let server;
let port;
let inbox = [];
let ctx;

function startSmtp() {
  return new Promise((resolve) => {
    server = new SMTPServer({
      authOptional: false,
      disabledCommands: ['STARTTLS'],
      onAuth(auth, _s, cb) {
        if (auth.username === 'sender' && auth.password === 'app-pass-123') return cb(null, { user: 'sender' });
        return cb(Object.assign(new Error('Invalid credentials'), { responseCode: 535 }));
      },
      onRcptTo(addr, _s, cb) {
        if (addr.address.startsWith('nouser')) return cb(Object.assign(new Error('5.1.1 User unknown'), { responseCode: 550 }));
        return cb();
      },
      onData(stream, session, cb) {
        let raw = '';
        stream.on('data', (d) => (raw += d));
        stream.on('end', () => {
          inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
          cb();
        });
      },
    });
    server.listen(0, '127.0.0.1', () => {
      port = server.server.address().port;
      resolve();
    });
  });
}

async function smtpAccount(extra = {}) {
  const res = await ctx.api().post('/api/v1/smtp-accounts', { name: 'Fake', fromEmail: 'sales@abacco.test', fromName: 'Abacco Sales', provider: 'CUSTOM', host: '127.0.0.1', port, security: 'NONE', username: 'sender', password: 'app-pass-123', hourlyLimit: 100, dailyLimit: 1000, workspaceIds: [ctx.ws1.id], ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function listWith(emails, countryCode) {
  const list = (await ctx.api(ctx.ws1.id).post('/api/v1/email-lists', { name: `List ${Date.now()}` })).body.data;
  await ctx.api(ctx.ws1.id).post(`/api/v1/email-lists/${list.id}/members`, { emails: emails.map((email) => ({ email, firstName: email.split('@')[0], countryCode })) });
  return list;
}

async function campaign(list, smtp, extra = {}) {
  const res = await ctx.api(ctx.ws1.id).post('/api/v1/campaigns', { name: `C ${Date.now()}`, subject: 'Hello {{firstName|there}}', fromName: 'Abacco', html: '<p>Hi {{firstName}}, see <a href="https://abacco.example/offer">our offer</a></p>', listIds: [list.id], smtpAccountIds: [smtp.id], ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
}

// Runs dispatcher + sender in-process until nothing is left to do.
async function drain() {
  for (let i = 0; i < 10; i++) {
    const queued = [];
    const s = await dispatchTick({ enqueue: async (rows) => queued.push(...rows) });
    for (const r of queued) await processRecipient(r.id);
    if (!queued.length && !s.started) break;
  }
}

beforeAll(async () => {
  await resetDatabase();
  await startSmtp();
  ctx = await createAccount('mail');
  await ctx.api().put(`/api/v1/sales-ids/${ctx.ws1.id}`, { senderLegalName: 'Abacco Technology Pvt Ltd', senderPostalAddress: '1 MG Road, Bengaluru 560001, India' });
});
beforeEach(() => (inbox = []));
afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

describe('SMTP accounts', () => {
  it('stores credentials encrypted and never returns them', async () => {
    const a = await smtpAccount({ fromEmail: 'enc@abacco.test' });
    expect(JSON.stringify(a)).not.toMatch(/app-pass-123|credential/i);
    const row = await prisma.smtpAccount.findUnique({ where: { id: a.id } });
    expect(row.credentialCiphertext).not.toContain('app-pass');
    const t = await ctx.api().post(`/api/v1/smtp-accounts/${a.id}/test`, {});
    expect(t.body.data).toMatchObject({ ok: true, health: 'HEALTHY' });
    const bad = await smtpAccount({ fromEmail: 'bad@abacco.test', password: 'wrong' });
    const tb = await ctx.api().post(`/api/v1/smtp-accounts/${bad.id}/test`, {});
    expect(tb.body.data).toMatchObject({ ok: false, health: 'AUTH_FAILED' });
  });
});

describe('campaign sending', () => {
  it('validates readiness before sending', async () => {
    const smtp = await smtpAccount({ fromEmail: 'ready@abacco.test' });
    const c = (await ctx.api(ctx.ws1.id).post('/api/v1/campaigns', { name: 'Empty', smtpAccountIds: [smtp.id] })).body.data;
    const res = await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/send`);
    expect(res.status).toBe(422);
    expect(res.body.error.details.issues.length).toBeGreaterThanOrEqual(3);
  });

  it('sends each recipient exactly once, excludes suppressed / no-consent / bounced, tracks and unsubscribes', async () => {
    const smtp = await smtpAccount({ fromEmail: 'send@abacco.test' });
    await ctx.api().post('/api/v1/suppressions', { emails: ['blocked@x.test'] });
    const list = await listWith(['ana@x.test', 'ben@x.test', 'blocked@x.test', 'nouser@x.test']);
    const gb = await listWith(['uk.person@x.test'], 'GB'); // UK requires prior consent → skipped
    const c = await campaign(list, smtp);
    await ctx.api(ctx.ws1.id).put(`/api/v1/campaigns/${c.id}`, { listIds: [list.id, gb.id] });

    const preview = (await ctx.api(ctx.ws1.id).get(`/api/v1/campaigns/${c.id}/preview`)).body.data;
    expect(preview.summary).toMatchObject({ total: 5, sendable: 3, suppressed: 1 });
    expect(preview.summary.skipped).toEqual({ NO_CONSENT_UK_GDPR: 1 });

    const launch = await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/send`);
    expect(launch.body.data.status).toBe('SENDING');
    await drain();

    const rec = await prisma.campaignRecipient.findMany({ where: { campaignId: c.id } });
    const by = Object.fromEntries(rec.map((r) => [r.email, r]));
    expect(by['ana@x.test'].status).toBe('SENT');
    expect(by['ben@x.test'].status).toBe('SENT');
    expect(by['nouser@x.test'].status).toBe('BOUNCED'); // 550 5.1.1 → hard bounce + suppression
    expect(by['blocked@x.test'].status).toBe('SUPPRESSED');
    expect(by['uk.person@x.test'].status).toBe('SKIPPED');
    expect(inbox).toHaveLength(2);
    const ana = inbox.find((m) => m.to.includes('ana@x.test')).raw;
    expect(ana).toMatch(/Subject: Hello ana/);
    expect(ana).toMatch(/List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
    expect(ana).toContain('Abacco Technology Pvt Ltd');
    expect(ana).toMatch(/\/t\/c\//); // link tracked
    expect(await prisma.suppression.count({ where: { reason: 'HARD_BOUNCE' } })).toBe(1);

    expect((await prisma.campaign.findUnique({ where: { id: c.id } })).status).toBe('COMPLETED');

    // A second processing attempt of an already-sent recipient does nothing.
    await prisma.campaignRecipient.update({ where: { id: by['ana@x.test'].id }, data: { status: 'QUEUED' } }).catch(() => {});
    await prisma.campaignRecipient.update({ where: { id: by['ana@x.test'].id }, data: { status: 'SENT' } });

    // Open, click, unsubscribe (RFC 8058 one-click).
    const token = by['ana@x.test'].trackingToken;
    await request(app).get(`/t/o/${token}.gif`).set('User-Agent', 'Mozilla/5.0 Thunderbird');
    const link = await prisma.trackedLink.findFirst({ where: { campaignId: c.id } });
    const click = await request(app).get(`/t/c/${token}/${link.id}`);
    expect(click.status).toBe(302);
    expect(click.headers.location).toBe('https://abacco.example/offer');
    const un = await request(app).post(`/u/${token}`).type('form').send('List-Unsubscribe=One-Click');
    expect(un.status).toBe(200);
    await request(app).post(`/u/${token}`).type('form').send('List-Unsubscribe=One-Click'); // twice → counted once
    const stats = (await ctx.api(ctx.ws1.id).get(`/api/v1/campaigns/${c.id}/statistics`)).body.data;
    expect(stats).toMatchObject({ accepted: 2, uniqueClicks: 1, unsubscribed: 1 });
    expect(stats.counts.BOUNCED).toBe(1);
    expect(await prisma.unsubscribe.count()).toBe(1);

    // The unsubscribed person is excluded from the next campaign.
    const c2 = await campaign(list, smtp);
    const p2 = (await ctx.api(ctx.ws1.id).get(`/api/v1/campaigns/${c2.id}/preview`)).body.data.summary;
    expect(p2.sendable).toBe(1); // only ben
  });

  it('claims atomically: two workers processing the same recipient send one email', async () => {
    const smtp = await smtpAccount({ fromEmail: 'race@abacco.test' });
    const list = await listWith(['race@y.test']);
    const c = await campaign(list, smtp);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/send`);
    const queued = [];
    await dispatchTick({ enqueue: async (rows) => queued.push(...rows) });
    const [r] = queued;
    const results = await Promise.all([processRecipient(r.id, { workerId: 'w1' }), processRecipient(r.id, { workerId: 'w2' }), processRecipient(r.id, { workerId: 'w3' })]);
    expect(results.filter((x) => x.status === 'SENT')).toHaveLength(1);
    expect(inbox).toHaveLength(1);
  });

  it('never resends after a crash mid-send; marks the outcome unknown instead', async () => {
    const smtp = await smtpAccount({ fromEmail: 'crash@abacco.test' });
    const list = await listWith(['crash@y.test']);
    const c = await campaign(list, smtp);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/send`);
    const r = await prisma.campaignRecipient.findFirst({ where: { campaignId: c.id } });
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'SENDING', lockedAt: new Date(Date.now() - 11 * 60000), lockedBy: 'dead-worker', attempts: 1 } });
    await drain();
    const after = await prisma.campaignRecipient.findUnique({ where: { id: r.id } });
    expect(after.status).toBe('FAILED');
    expect(after.lastError).toMatch(/UNKNOWN_OUTCOME/);
    expect(inbox).toHaveLength(0);
    expect((await prisma.campaign.findUnique({ where: { id: c.id } })).status).toBe('FAILED');
    // Retry is a deliberate user action.
    expect((await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/retry-failed`)).body.data.requeued).toBe(1);
    await drain();
    expect(inbox).toHaveLength(1);
  });

  it('pauses, resumes and cancels without losing or duplicating recipients', async () => {
    const smtp = await smtpAccount({ fromEmail: 'pause@abacco.test' });
    const list = await listWith(['p1@y.test', 'p2@y.test', 'p3@y.test']);
    const c = await campaign(list, smtp);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/send`);
    const queued = [];
    await dispatchTick({ enqueue: async (rows) => queued.push(...rows) });
    await processRecipient(queued[0].id);
    expect((await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/pause`)).body.data.status).toBe('PAUSED');
    for (const r of queued.slice(1)) expect((await processRecipient(r.id)).skipped).toBe('NOT_CLAIMABLE');
    expect(await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: 'PENDING' } })).toBe(2);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/resume`);
    await drain();
    expect(inbox).toHaveLength(3);
    expect(new Set(inbox.map((m) => m.to[0])).size).toBe(3);

    const c2 = await campaign(list, smtp);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c2.id}/send`);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c2.id}/cancel`);
    await drain();
    expect(await prisma.campaignRecipient.count({ where: { campaignId: c2.id, status: 'CANCELLED' } })).toBe(3);
    expect(inbox).toHaveLength(3);
  });

  it('respects the SMTP daily limit by waiting, not by switching or dropping', async () => {
    const smtp = await smtpAccount({ fromEmail: 'limit@abacco.test', hourlyLimit: 2, dailyLimit: 2 });
    const list = await listWith(['l1@z.test', 'l2@z.test', 'l3@z.test']);
    const c = await campaign(list, smtp);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/send`);
    await drain();
    expect(inbox).toHaveLength(2);
    const waiting = await prisma.campaignRecipient.findFirst({ where: { campaignId: c.id, status: 'PENDING' } });
    expect(waiting.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect((await prisma.campaign.findUnique({ where: { id: c.id } })).status).toBe('SENDING'); // not completed while pending
  });

  it('pauses the campaign when the only SMTP account rejects the password', async () => {
    const smtp = await smtpAccount({ fromEmail: 'authfail@abacco.test', password: 'wrong' });
    const list = await listWith(['af@z.test']);
    const c = await campaign(list, smtp);
    await ctx.api(ctx.ws1.id).post(`/api/v1/campaigns/${c.id}/send`);
    await drain();
    const after = await prisma.campaign.findUnique({ where: { id: c.id } });
    expect(after.status).toBe('PAUSED');
    expect(after.statusReason).toMatch(/No usable SMTP account/);
    expect((await prisma.smtpAccount.findUnique({ where: { id: smtp.id } })).health).toBe('AUTH_FAILED');
    expect(await prisma.campaignRecipient.count({ where: { campaignId: c.id, status: 'PENDING' } })).toBe(1);
  });

  it('applies SES bounce/complaint events once', async () => {
    const r = await prisma.campaignRecipient.findFirst({ where: { email: 'ben@x.test' } });
    const msg = { notificationType: 'Complaint', mail: { messageId: 'ses-1', commonHeaders: { messageId: r.messageId } }, complaint: { complaintFeedbackType: 'abuse' } };
    expect((await handleSesNotification(msg)).matched).toBe(true);
    await handleSesNotification(msg);
    expect(await prisma.emailEvent.count({ where: { recipientId: r.id, type: 'COMPLAINED' } })).toBe(1);
    expect(await prisma.suppression.count({ where: { emailNormalized: 'ben@x.test', reason: 'COMPLAINT' } })).toBe(1);
  });
});

describe('scheduling across time zones', () => {
  const now = new Date('2026-11-04T10:00:00Z'); // 15:30 in India
  const camp = { scheduleMode: 'RECIPIENT_LOCAL', localSendDate: '2026-11-05', localSendTime: '09:00', pastTimeBehaviour: 'NEXT_DAY' };
  it('sends at 09:00 local time for each recipient', () => {
    expect(computeSendTime(camp, { timezone: 'Asia/Kolkata' }, { now }).at.toISOString()).toBe('2026-11-05T03:30:00.000Z');
    expect(computeSendTime(camp, { timezone: 'America/New_York' }, { now }).at.toISOString()).toBe('2026-11-05T14:00:00.000Z');
    expect(computeSendTime(camp, { timezone: 'Europe/London' }, { now }).at.toISOString()).toBe('2026-11-05T09:00:00.000Z');
  });
  it('handles past local times and business hours', () => {
    const past = { ...camp, localSendDate: '2026-11-04', localSendTime: '09:00' };
    expect(computeSendTime(past, { timezone: 'Asia/Kolkata' }, { now }).at.toISOString()).toBe('2026-11-05T03:30:00.000Z');
    expect(computeSendTime({ ...past, pastTimeBehaviour: 'SKIP' }, { timezone: 'Asia/Kolkata' }, { now }).skip).toBe('PAST_LOCAL_TIME');
    // Saturday 07:00 in Dubai with Mon–Fri 09:00–18:00 → Monday 09:00 Dubai
    const sat = { scheduleMode: 'FIXED_TIME', scheduledAtUtc: new Date('2026-11-07T03:00:00Z'), respectBusinessHours: true };
    expect(computeSendTime(sat, { timezone: 'Asia/Dubai', countryCode: 'AE' }, { now, business: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }, holidays: new Set() }).at.toISOString()).toBe('2026-11-09T05:00:00.000Z');
  });
});

describe('automation', () => {
  it('enrols a new lead, waits, sends once and creates a task', async () => {
    registerAutomationTriggers();
    const smtp = await smtpAccount({ fromEmail: 'auto@abacco.test' });
    const a = await ctx.api(ctx.ws1.id).post('/api/v1/automations', {
      name: 'Welcome', triggerType: 'LEAD_CREATED', smtpAccountId: smtp.id,
      steps: [{ type: 'SEND_EMAIL', config: { subject: 'Welcome {{firstName}}', html: '<p>Hi {{firstName}}</p>' } }, { type: 'WAIT', config: { amount: 1, unit: 'minutes' } }, { type: 'CREATE_TASK', config: { title: 'Follow up welcome', dueInDays: 1 } }],
    });
    expect(a.status).toBe(201);
    expect((await ctx.api(ctx.ws1.id).post(`/api/v1/automations/${a.body.data.id}/activate`)).body.data.status).toBe('ACTIVE');
    await ctx.api(ctx.ws1.id).post('/api/v1/leads', { firstName: 'Neha', email: 'neha@auto.test' });
    await new Promise((r) => setTimeout(r, 300)); // event handler is async
    await automationTick();
    await automationTick();
    expect(inbox.filter((m) => m.to.includes('neha@auto.test'))).toHaveLength(1);
    const e = await prisma.automationEnrollment.findFirst({ where: { emailNormalized: 'neha@auto.test' } });
    expect(e.currentPosition).toBe(2); // waiting before the task step
    await prisma.automationEnrollment.update({ where: { id: e.id }, data: { nextRunAt: new Date() } });
    await automationTick();
    await automationTick();
    expect((await prisma.automationEnrollment.findUnique({ where: { id: e.id } })).status).toBe('COMPLETED');
    expect(await prisma.task.count({ where: { title: 'Follow up welcome' } })).toBe(1);
    expect(inbox.filter((m) => m.to.includes('neha@auto.test'))).toHaveLength(1);
  });
});
