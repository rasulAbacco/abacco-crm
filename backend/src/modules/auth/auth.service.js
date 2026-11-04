import argon2 from 'argon2';
import crypto from 'node:crypto';
import prisma from '../../prisma/client.js';
import config from '../../config/environment.js';
import { AppError, unauthorized } from '../../utils/errors.js';
import { newOpaqueToken, signAccessToken } from './auth.tokens.js';
import { sha256 } from '../../utils/normalize.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { sendSystemMail } from '../../services/email/systemMailer.js';
import { bootstrapAccount } from '../account/account.bootstrap.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const ROTATION_GRACE_MS = 10_000; // two tabs refreshing at once is not token theft
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// A fixed hash so a login for an unknown email costs the same time as a real one.
const DUMMY_HASH = await argon2.hash(crypto.randomBytes(16).toString('hex'), ARGON_OPTS);

export const hashPassword = (pw) => argon2.hash(pw, ARGON_OPTS);

export function publicUser(user) {
  return {
    id: user.id,
    accountId: user.accountId,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    locale: user.locale,
    lastLoginAt: user.lastLoginAt,
  };
}

async function issueRefreshToken(userId, familyId, meta, db = prisma) {
  const { raw, hash } = newOpaqueToken();
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86400_000);
  const row = await db.refreshToken.create({
    data: { userId, familyId, tokenHash: hash, expiresAt, userAgent: meta.userAgent, ip: meta.ip },
  });
  return { raw, expiresAt, id: row.id };
}

async function sessionFor(user, familyId, meta, db = prisma) {
  const refresh = await issueRefreshToken(user.id, familyId, meta, db);
  return { accessToken: signAccessToken(user), refresh, user: publicUser(user) };
}

// ---------------------------------------------------------------- setup (first run only)

export async function setupPrimaryAccount({ setupToken, accountName, name, email, password }, meta) {
  if (!config.SETUP_TOKEN) throw new AppError(404, 'SETUP_DISABLED', 'Account setup is disabled.');
  const a = Buffer.from(String(setupToken));
  const b = Buffer.from(config.SETUP_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw unauthorized('Invalid setup token.', 'INVALID_SETUP_TOKEN');

  const passwordHash = await hashPassword(password);
  const result = await prisma.$transaction(async (tx) => {
    // Serialise concurrent setup attempts; only the very first one wins.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(91827364)`;
    if ((await tx.user.count()) > 0) throw new AppError(409, 'ALREADY_SET_UP', 'The primary account already exists.');
    const { account, user } = await bootstrapAccount(tx, { accountName, name, email, passwordHash });
    await writeAudit({ accountId: account.id, action: 'account.setup', entityType: 'Account', entityId: account.id, ctx: { ...meta, userId: user.id } }, tx);
    return user;
  });
  return sessionFor(result, crypto.randomUUID(), meta);
}

// ---------------------------------------------------------------- login / refresh / logout

export async function login({ email, password }, meta) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    await argon2.verify(DUMMY_HASH, password).catch(() => false);
    throw unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) throw unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes or reset your password.');
  }

  const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    await writeAudit({ accountId: user.accountId, action: 'auth.login_failed', entityType: 'User', entityId: user.id, metadata: { failed }, ctx: meta });
    throw unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  }

  const updates = { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() };
  if (argon2.needsRehash(user.passwordHash, ARGON_OPTS)) updates.passwordHash = await hashPassword(password);
  const fresh = await prisma.user.update({ where: { id: user.id }, data: updates });
  await writeAudit({ accountId: user.accountId, action: 'auth.login', entityType: 'User', entityId: user.id, ctx: { ...meta, userId: user.id } });
  return sessionFor(fresh, crypto.randomUUID(), meta);
}

export async function refresh(rawToken, meta) {
  if (!rawToken) throw unauthorized('Session expired.', 'NO_REFRESH_TOKEN');
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { user: true } });
  if (!token) throw unauthorized('Session expired.', 'INVALID_REFRESH_TOKEN');

  const now = Date.now();
  if (token.revokedAt) {
    const benignRace = token.revokeReason === 'rotated' && now - token.revokedAt.getTime() < ROTATION_GRACE_MS;
    if (!benignRace) {
      // A rotated-away token came back: assume theft and end every session in the family.
      await prisma.refreshToken.updateMany({
        where: { familyId: token.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'reuse_detected' },
      });
      await writeAudit({ accountId: token.user.accountId, action: 'auth.refresh_reuse_detected', entityType: 'User', entityId: token.userId, ctx: meta });
      throw unauthorized('Session expired. Please sign in again.', 'REFRESH_REUSED');
    }
  }
  if (token.expiresAt.getTime() <= now) throw unauthorized('Session expired.', 'REFRESH_EXPIRED');
  if (!token.user.isActive) throw unauthorized('Session expired.', 'INVALID_REFRESH_TOKEN');

  return prisma.$transaction(async (tx) => {
    const next = await issueRefreshToken(token.userId, token.familyId, meta, tx);
    if (!token.revokedAt) {
      // Conditional update: if another request rotated it first, count stays 0.
      await tx.refreshToken.updateMany({
        where: { id: token.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'rotated', replacedById: next.id },
      });
    }
    return { accessToken: signAccessToken(token.user), refresh: next, user: publicUser(token.user) };
  });
}

export async function logout(rawToken, { allSessions = false, userId } = {}) {
  if (allSessions && userId) {
    await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'logout_all' } });
    return;
  }
  if (!rawToken) return;
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!token) return;
  await prisma.refreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'logout' } });
}

// ---------------------------------------------------------------- password management

export async function forgotPassword(email, meta) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Same response whether or not the address exists.
  if (!user || !user.isActive) return;

  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  const { raw, hash } = newOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + config.PASSWORD_RESET_TTL_MINUTES * 60_000) },
  });
  const link = `${config.APP_URL}/reset-password?token=${encodeURIComponent(raw)}`;
  await sendSystemMail({
    to: user.email,
    subject: 'Reset your Abacco CRM password',
    text: `Use this link within ${config.PASSWORD_RESET_TTL_MINUTES} minutes to set a new password:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
    html: `<p>Use this link within ${config.PASSWORD_RESET_TTL_MINUTES} minutes to set a new password:</p><p><a href="${link}">Reset password</a></p><p>If you did not ask for this, ignore this email.</p>`,
  });
  await writeAudit({ accountId: user.accountId, action: 'auth.password_reset_requested', entityType: 'User', entityId: user.id, ctx: meta });
}

async function setPassword(tx, user, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  await tx.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'password_changed' } });
}

export async function resetPassword({ token, password }, meta) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt <= new Date()) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired. Request a new one.');
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link has already been used.');
    await setPassword(tx, row.user, password);
    await writeAudit({ accountId: row.user.accountId, action: 'auth.password_reset', entityType: 'User', entityId: row.userId, ctx: meta }, tx);
  });
}

export async function changePassword(userId, { currentPassword, newPassword }, meta) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
  if (!valid) throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');
  await prisma.$transaction(async (tx) => {
    await setPassword(tx, user, newPassword);
    await writeAudit({ accountId: user.accountId, action: 'auth.password_changed', entityType: 'User', entityId: user.id, ctx: { ...meta, userId } }, tx);
  });
  // Changing the password ends other sessions; give this one a fresh session.
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return sessionFor(fresh, crypto.randomUUID(), meta);
}

export async function updateProfile(userId, data) {
  const user = await prisma.user.update({ where: { id: userId }, data });
  return publicUser(user);
}

export async function getMe(userId) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { account: { select: { id: true, name: true, defaultCurrency: true, defaultTimezone: true, defaultLocale: true } } },
  });
  return { ...publicUser(user), account: user.account };
}
