import crypto from 'node:crypto';
import prisma from '../../prisma/client.js';
import { SMTP_PROVIDERS, sesRegionFromHost } from '../../config/smtp.js';
import { encryptJson } from '../../services/encryption/encryptionService.js';
import { credentialAad, verifyAccount, classifySmtpError, safeSmtpError, getTransport } from '../../services/email/smtpTransport.js';
import { currentUsage } from '../../services/email/rateLimiter.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { AppError, notFound } from '../../utils/errors.js';

// Never select credential columns for API responses.
const PUBLIC = {
  id: true, name: true, fromEmail: true, fromName: true, provider: true, host: true, port: true, security: true, authType: true, username: true,
  sesRegion: true, hourlyLimit: true, dailyLimit: true, isEnabled: true, health: true, unhealthyUntil: true, consecutiveFailures: true,
  lastTestedAt: true, lastError: true, lastUsedAt: true, createdAt: true, updatedAt: true,
  workspaces: { select: { workspace: { select: { id: true, code: true, name: true } } } },
};

function shape(a, usage) {
  const { workspaces, ...rest } = a;
  return { ...rest, workspaces: workspaces.map((w) => w.workspace), usage: usage?.[a.id] ?? null };
}

async function find(accountId, id, select = PUBLIC) {
  const a = await prisma.smtpAccount.findFirst({ where: { id, accountId, deletedAt: null }, select });
  if (!a) throw notFound('SMTP account');
  return a;
}

async function validWorkspaces(accountId, ids) {
  if (!ids?.length) return [];
  const rows = await prisma.salesWorkspace.findMany({ where: { id: { in: ids }, accountId, deletedAt: null }, select: { id: true } });
  if (rows.length !== new Set(ids).size) throw new AppError(400, 'INVALID_SALES_ID', 'One or more Sales IDs do not exist.');
  return rows.map((r) => r.id);
}

function encrypt(id, input) {
  const secret = input.authType === 'OAUTH2' || input.oauth ? input.oauth : { password: input.password };
  const box = encryptJson(secret, credentialAad(id));
  return { credentialCiphertext: box.ciphertext, credentialIv: box.iv, credentialTag: box.tag, credentialKeyVersion: box.keyVersion };
}

export const providers = () => SMTP_PROVIDERS;

export async function list(scope) {
  const where = { accountId: scope.accountId, deletedAt: null, ...(scope.mode === 'single' ? { workspaces: { some: { workspaceId: scope.workspaceId } } } : {}) };
  const rows = await prisma.smtpAccount.findMany({ where, select: PUBLIC, orderBy: { createdAt: 'asc' } });
  const usage = await currentUsage(rows.map((r) => r.id)).catch(() => ({}));
  return rows.map((r) => shape(r, usage));
}

export async function get(accountId, id) {
  const a = await find(accountId, id);
  const usage = await currentUsage([id]).catch(() => ({}));
  return shape(a, usage);
}

export async function create(accountId, input, ctx) {
  const preset = SMTP_PROVIDERS[input.provider];
  const id = crypto.randomUUID();
  const host = input.host ?? preset.host;
  if (!host) throw new AppError(422, 'VALIDATION_ERROR', 'Enter the SMTP host.');
  const hourlyLimit = input.hourlyLimit ?? preset.hourlyLimit;
  const dailyLimit = input.dailyLimit ?? preset.dailyLimit;
  if (hourlyLimit > dailyLimit) throw new AppError(422, 'VALIDATION_ERROR', 'The hourly limit cannot be higher than the daily limit.');
  const workspaceIds = await validWorkspaces(accountId, input.workspaceIds);
  const row = await prisma.$transaction(async (tx) => {
    const a = await tx.smtpAccount.create({
      data: {
        id, accountId, name: input.name, fromEmail: input.fromEmail, fromName: input.fromName, provider: input.provider, host, port: input.port ?? preset.port,
        security: input.security ?? preset.security, authType: input.authType, username: input.username, hourlyLimit, dailyLimit,
        isEnabled: input.isEnabled ?? true, sesRegion: input.provider === 'AMAZON_SES' ? sesRegionFromHost(host) : null, ...encrypt(id, input),
        workspaces: { create: workspaceIds.map((workspaceId) => ({ workspaceId })) },
      },
      select: PUBLIC,
    });
    await writeAudit({ accountId, action: 'smtp.create', entityType: 'SmtpAccount', entityId: id, after: { name: a.name, fromEmail: a.fromEmail, provider: a.provider, host, workspaceIds }, ctx }, tx);
    return a;
  });
  return shape(row);
}

export async function update(accountId, id, input, ctx) {
  const before = await find(accountId, id, { ...PUBLIC });
  const { password, oauth, workspaceIds, ...fields } = input;
  const data = { ...fields };
  const credentialsChanged = Boolean(password || oauth);
  if (credentialsChanged) Object.assign(data, encrypt(id, { authType: fields.authType ?? before.authType, password, oauth }));
  if (credentialsChanged || fields.host || fields.port || fields.security || fields.username) Object.assign(data, { health: 'UNTESTED', consecutiveFailures: 0, unhealthyUntil: null });
  if (fields.host) data.sesRegion = (fields.provider ?? before.provider) === 'AMAZON_SES' ? sesRegionFromHost(fields.host) : null;
  const hl = fields.hourlyLimit ?? before.hourlyLimit;
  const dl = fields.dailyLimit ?? before.dailyLimit;
  if (hl > dl) throw new AppError(422, 'VALIDATION_ERROR', 'The hourly limit cannot be higher than the daily limit.');
  const row = await prisma.$transaction(async (tx) => {
    if (workspaceIds) {
      const ids = await validWorkspaces(accountId, workspaceIds);
      await tx.smtpAccountWorkspace.deleteMany({ where: { smtpAccountId: id, workspaceId: { notIn: ids } } });
      for (const workspaceId of ids) await tx.smtpAccountWorkspace.upsert({ where: { smtpAccountId_workspaceId: { smtpAccountId: id, workspaceId } }, create: { smtpAccountId: id, workspaceId }, update: {} });
    }
    const a = await tx.smtpAccount.update({ where: { id }, data, select: PUBLIC });
    await writeAudit({ accountId, action: 'smtp.update', entityType: 'SmtpAccount', entityId: id, after: { ...fields, credentialsChanged, workspaceIds }, ctx }, tx);
    return a;
  });
  return shape(row);
}

export async function remove(accountId, id, ctx) {
  await find(accountId, id);
  await prisma.$transaction(async (tx) => {
    await tx.smtpAccount.update({ where: { id }, data: { deletedAt: new Date(), isEnabled: false } });
    await tx.smtpAccountWorkspace.deleteMany({ where: { smtpAccountId: id } });
    await writeAudit({ accountId, action: 'smtp.delete', entityType: 'SmtpAccount', entityId: id, ctx }, tx);
  });
  return { deleted: true };
}

export async function test(accountId, id, { sendTo }, ctx) {
  const account = await prisma.smtpAccount.findFirst({ where: { id, accountId, deletedAt: null } });
  if (!account) throw notFound('SMTP account');
  let result;
  try {
    await verifyAccount(account);
    if (sendTo) {
      await getTransport(account).sendMail({
        from: account.fromName ? { name: account.fromName, address: account.fromEmail } : account.fromEmail,
        to: sendTo,
        subject: 'Abacco CRM — SMTP test',
        text: `This is a test message from the SMTP account "${account.name}". If you can read it, sending works.`,
      });
    }
    result = { ok: true, health: 'HEALTHY', message: sendTo ? `Connected and sent a test email to ${sendTo}.` : 'Connected and signed in successfully.' };
  } catch (err) {
    const { kind } = classifySmtpError(err);
    const health = kind === 'AUTH' ? 'AUTH_FAILED' : 'UNHEALTHY';
    const hint = kind === 'AUTH'
      ? account.provider === 'GMAIL' || account.provider === 'YAHOO'
        ? ' Use an app password (2-Step Verification must be on).'
        : account.provider === 'AMAZON_SES' ? ' Use SES SMTP credentials, not IAM access keys.' : ''
      : '';
    result = { ok: false, health, message: `${kind === 'AUTH' ? 'Sign-in rejected' : 'Could not connect'}: ${safeSmtpError(err)}.${hint}` };
  }
  await prisma.smtpAccount.update({
    where: { id },
    data: { health: result.health, lastTestedAt: new Date(), lastError: result.ok ? null : result.message, ...(result.ok ? { consecutiveFailures: 0, unhealthyUntil: null } : {}) },
  });
  await writeAudit({ accountId, action: 'smtp.test', entityType: 'SmtpAccount', entityId: id, metadata: { ok: result.ok, sendTo: sendTo ? 'yes' : 'no' }, ctx });
  return result;
}

export async function logs(accountId, id) {
  await find(accountId, id);
  const [events, windows, failures] = await Promise.all([
    prisma.emailEvent.findMany({ where: { smtpAccountId: id }, orderBy: { occurredAt: 'desc' }, take: 100, select: { id: true, type: true, occurredAt: true, metadata: true, campaign: { select: { id: true, name: true } } } }),
    prisma.smtpUsageWindow.findMany({ where: { smtpAccountId: id, window: 'DAY' }, orderBy: { windowStart: 'desc' }, take: 30 }),
    prisma.campaignRecipient.findMany({ where: { smtpAccountId: id, status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, email: true, lastError: true, updatedAt: true, campaign: { select: { id: true, name: true } } } }),
  ]);
  return { events, daily: windows, failures };
}
