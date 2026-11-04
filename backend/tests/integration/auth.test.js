import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma, resetDatabase, createAccount, PASSWORD } from '../helpers/testApp.js';
import { __takeTestOutbox } from '../../src/services/email/systemMailer.js';

const XHR = { 'X-Requested-With': 'XMLHttpRequest' };

function refreshCookie(res) {
  const raw = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('abacco_rt='));
  return raw ? raw.split(';')[0] : null;
}

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('first-run setup', () => {
  it('rejects a wrong setup token', async () => {
    const res = await request(app).post('/api/v1/auth/setup').send({ setupToken: 'wrong-token-wrong-token-wrong', accountName: 'Abacco', name: 'Admin', email: 'admin@abacco.test', password: 'Password123' });
    expect(res.status).toBe(401);
  });

  it('creates the primary account once, with SID-001 and its pipeline', async () => {
    const res = await request(app).post('/api/v1/auth/setup').send({ setupToken: process.env.SETUP_TOKEN, accountName: 'Abacco', name: 'Admin', email: 'Admin@Abacco.test', password: 'Password123' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('admin@abacco.test');
    expect(refreshCookie(res)).toBeTruthy();

    const ws = await prisma.salesWorkspace.findMany({ include: { pipelines: { include: { stages: true } }, settings: true } });
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ code: 'SID-001', isDefault: true, status: 'ACTIVE' });
    expect(ws[0].settings).toBeTruthy();
    expect(ws[0].pipelines[0].stages.map((s) => s.name)).toEqual(expect.arrayContaining(['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']));
    expect(await prisma.countryProfile.count()).toBeGreaterThan(5);

    const again = await request(app).post('/api/v1/auth/setup').send({ setupToken: process.env.SETUP_TOKEN, accountName: 'Second Co', name: 'Y', email: 'other@abacco.test', password: 'Password123' });
    expect(again.status).toBe(409);
  });
});

describe('login, refresh, logout', () => {
  it('rejects bad credentials with one generic message', async () => {
    const ctx = await createAccount('login');
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: 'nope-nope-1' });
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.test', password: 'nope-nope-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('issues an httpOnly refresh cookie and never returns the password hash', async () => {
    const ctx = await createAccount('cookie');
    const res = await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('abacco_rt='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.account.defaultCurrency).toBe('INR');
    expect(me.body.data.account.defaultTimezone).toBe('Asia/Kolkata');
  });

  it('requires the X-Requested-With header on refresh', async () => {
    const ctx = await createAccount('xhr');
    const login = await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: PASSWORD });
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(login));
    expect(res.status).toBe(400);
  });

  it('rotates refresh tokens and kills the family when an old token is replayed', async () => {
    const ctx = await createAccount('rotate');
    const login = await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: PASSWORD });
    const first = refreshCookie(login);

    const r1 = await request(app).post('/api/v1/auth/refresh').set(XHR).set('Cookie', first);
    expect(r1.status).toBe(200);
    const second = refreshCookie(r1);
    expect(second).not.toBe(first);

    // Within the grace window a duplicate refresh (two tabs) still succeeds.
    const dup = await request(app).post('/api/v1/auth/refresh').set(XHR).set('Cookie', first);
    expect(dup.status).toBe(200);

    // After the grace window the old token is treated as stolen.
    await prisma.refreshToken.updateMany({ where: { revokeReason: 'rotated' }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    const replay = await request(app).post('/api/v1/auth/refresh').set(XHR).set('Cookie', first);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');

    const afterTheft = await request(app).post('/api/v1/auth/refresh').set(XHR).set('Cookie', second);
    expect(afterTheft.status).toBe(401);
  });

  it('logout revokes the session', async () => {
    const ctx = await createAccount('logout');
    const login = await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: PASSWORD });
    const cookie = refreshCookie(login);
    const out = await request(app).post('/api/v1/auth/logout').set(XHR).set('Cookie', cookie).send({});
    expect(out.status).toBe(204);
    const res = await request(app).post('/api/v1/auth/refresh').set(XHR).set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('locks the user after 5 failed attempts', async () => {
    const ctx = await createAccount('lock');
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: 'wrong-pass-1' });
    const res = await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: PASSWORD });
    expect(res.status).toBe(423);
  });
});

describe('password reset and change', () => {
  it('resets via emailed link, signs out old sessions and rejects old access tokens', async () => {
    const ctx = await createAccount('reset');
    const login = await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: PASSWORD });
    __takeTestOutbox();

    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: ctx.email });
    expect(forgot.status).toBe(200);
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.test' });
    expect(unknown.body).toEqual(forgot.body);

    const [mail] = __takeTestOutbox();
    expect(mail.to).toBe(ctx.email);
    const token = decodeURIComponent(mail.text.match(/token=([^\s]+)/)[1]);
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: token } })).toBe(0); // only the hash is stored

    await new Promise((r) => setTimeout(r, 1100)); // passwordChangedAt must be a later second than the old token
    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'BrandNewPass9' });
    expect(reset.status).toBe(200);
    const reuse = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'BrandNewPass9' });
    expect(reuse.status).toBe(400);

    expect((await request(app).post('/api/v1/auth/refresh').set(XHR).set('Cookie', refreshCookie(login))).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${ctx.token}`)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: ctx.email, password: 'BrandNewPass9' })).status).toBe(200);
  });

  it('enforces the password rule', async () => {
    const ctx = await createAccount('rule');
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${ctx.token}`)
      .set(XHR)
      .send({ currentPassword: PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(422);
  });
});
