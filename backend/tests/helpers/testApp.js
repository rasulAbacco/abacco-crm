import request from 'supertest';
import { createApp } from '../../src/app.js';
import prisma from '../../src/prisma/client.js';
import { hashPassword } from '../../src/modules/auth/auth.service.js';
import { bootstrapAccount } from '../../src/modules/account/account.bootstrap.js';
import { normalizeEmail, normalizeName } from '../../src/utils/normalize.js';

export const app = createApp();
export { prisma };

export async function resetDatabase() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export const PASSWORD = 'CorrectHorse42';

/** Creates an account + user + SID-001 and returns an authenticated agent. */
export async function createAccount(label = `acct${++counter}`) {
  const email = `${label}-${Date.now()}@example.test`;
  const { account, user } = await prisma.$transaction(async (tx) =>
    bootstrapAccount(tx, { accountName: `${label} Ltd`, name: `${label} Admin`, email, passwordHash: await hashPassword(PASSWORD) }),
  );
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  const token = login.body.data.accessToken;
  const ws1 = await prisma.salesWorkspace.findFirst({ where: { accountId: account.id, code: 'SID-001' } });
  const api = (salesId = 'all') => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`).set('X-Sales-Id', salesId),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).set('X-Sales-Id', salesId).send(body ?? {}),
    put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${token}`).set('X-Sales-Id', salesId).send(body ?? {}),
    patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).set('X-Sales-Id', salesId).send(body ?? {}),
    upload: (url, filename, content) => request(app).post(url).set('Authorization', `Bearer ${token}`).set('X-Sales-Id', salesId).attach('file', Buffer.from(content), filename),
    delete: (url, body) => request(app).delete(url).set('Authorization', `Bearer ${token}`).set('X-Sales-Id', salesId).send(body ?? {}),
  });
  return { account, user, email, token, ws1, api };
}

export async function createWorkspace(ctx, name) {
  const res = await ctx.api().post('/api/v1/sales-ids', { name });
  if (res.status !== 201) throw new Error(`create workspace failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

// Phase 2 has no lead/contact endpoints yet (Phase 4), so tests insert rows directly.
export function makeLead(accountId, ownerWorkspaceId, overrides = {}) {
  const email = overrides.email ?? `lead${++counter}@example.test`;
  return prisma.lead.create({
    data: { accountId, ownerWorkspaceId, fullName: `Lead ${counter}`, email, emailNormalized: normalizeEmail(email), ...overrides },
  });
}

export function makeContact(accountId, ownerWorkspaceId, overrides = {}) {
  const email = overrides.email ?? `contact${++counter}@example.test`;
  return prisma.contact.create({
    data: { accountId, ownerWorkspaceId, firstName: 'Contact', lastName: String(counter), email, emailNormalized: normalizeEmail(email), ...overrides },
  });
}

export function makeCompany(accountId, ownerWorkspaceId, name = `Company ${++counter}`) {
  return prisma.company.create({ data: { accountId, ownerWorkspaceId, name, nameNormalized: normalizeName(name) } });
}

export async function makeDeal(accountId, ownerWorkspaceId, stageName = 'Proposal', overrides = {}) {
  const pipeline = await prisma.pipeline.findFirst({ where: { workspaceId: ownerWorkspaceId }, include: { stages: true } });
  const stage = pipeline.stages.find((s) => s.name === stageName);
  return prisma.deal.create({
    data: { accountId, ownerWorkspaceId, pipelineId: pipeline.id, stageId: stage.id, title: `Deal ${++counter}`, amountMinor: 1250000n, currency: 'INR', ...overrides },
  });
}
