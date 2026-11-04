// Open / click / unsubscribe / provider-event processing. Every event has a
// dedupe key so retries, double clicks and SNS redeliveries count once.
import crypto from 'node:crypto';
import prisma from '../../prisma/client.js';
import config from '../../config/environment.js';
import logger from '../../config/logger.js';
import { suppress } from '../../services/email/suppressionService.js';
import { hashEmail, normalizeEmail } from '../../utils/normalize.js';

const BOT_UA = /bot|crawler|spider|preview|scanner|barracuda|proofpoint|mimecast|safelinks|curl|python|wget/i;

async function recordEvent(data) {
  try {
    await prisma.emailEvent.create({ data });
    return true;
  } catch (err) {
    if (err.code === 'P2002') return false; // duplicate → already counted
    throw err;
  }
}

const recipientByToken = (token) =>
  prisma.campaignRecipient.findUnique({ where: { trackingToken: token }, include: { campaign: { select: { id: true, accountId: true, ownerWorkspaceId: true, name: true } } } });

export async function trackOpen(token, { ip, userAgent }) {
  const r = await recipientByToken(token);
  if (!r) return;
  const now = new Date();
  // Opens within 10 s of sending, or from known scanners, are flagged as machine opens.
  const isMachine = BOT_UA.test(userAgent ?? '') || (r.sentAt && now - r.sentAt < 10_000);
  const hour = Math.floor(now.getTime() / 3600000);
  const fresh = await recordEvent({ accountId: r.campaign.accountId, workspaceId: r.campaign.ownerWorkspaceId, campaignId: r.campaignId, recipientId: r.id, smtpAccountId: r.smtpAccountId, type: 'OPENED', source: 'TRACKING_PIXEL', dedupeKey: `open:${r.id}:${hour}`, isMachine, ip, userAgent: userAgent?.slice(0, 300), occurredAt: now });
  if (fresh && !isMachine && !r.firstOpenedAt) await prisma.campaignRecipient.update({ where: { id: r.id }, data: { firstOpenedAt: now } });
}

/** Returns the destination URL (only URLs stored for that campaign — never an open redirect). */
export async function trackClick(token, linkId, { ip, userAgent }) {
  const link = await prisma.trackedLink.findUnique({ where: { id: linkId } });
  if (!link) return null;
  const r = await recipientByToken(token);
  if (!r || r.campaignId !== link.campaignId) return link.url;
  const now = new Date();
  const isMachine = BOT_UA.test(userAgent ?? '');
  const minute = Math.floor(now.getTime() / 60000);
  const fresh = await recordEvent({ accountId: r.campaign.accountId, workspaceId: r.campaign.ownerWorkspaceId, campaignId: r.campaignId, recipientId: r.id, smtpAccountId: r.smtpAccountId, type: 'CLICKED', source: 'LINK_REDIRECT', dedupeKey: `click:${r.id}:${linkId}:${minute}`, url: link.url, isMachine, ip, userAgent: userAgent?.slice(0, 300), occurredAt: now });
  if (fresh && !isMachine) {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { firstClickedAt: r.firstClickedAt ?? now, firstOpenedAt: r.firstOpenedAt ?? now } });
  }
  return link.url;
}

// ---------------------------------------------------------------- unsubscribe

const unsubKey = () => crypto.createHash('sha256').update(`unsub:${config.JWT_ACCESS_SECRET}`).digest();

/** Signed unsubscribe token for automation emails (no campaign recipient row). */
export function automationUnsubToken({ accountId, workspaceId, email }) {
  const payload = Buffer.from(JSON.stringify({ a: accountId, w: workspaceId, e: normalizeEmail(email) })).toString('base64url');
  const sig = crypto.createHmac('sha256', unsubKey()).update(payload).digest('base64url').slice(0, 32);
  return `a.${payload}.${sig}`;
}

function readAutomationToken(token) {
  const [, payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', unsubKey()).update(payload).digest('base64url').slice(0, 32);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return { accountId: p.a, workspaceId: p.w, email: p.e };
}

export async function describeToken(token) {
  if (token === 'test-preview') return { test: true };
  if (token.startsWith('a.')) {
    const t = readAutomationToken(token);
    if (!t) return null;
    const ws = await prisma.salesWorkspace.findUnique({ where: { id: t.workspaceId }, select: { name: true, senderLegalName: true } });
    return { email: t.email, sender: ws?.senderLegalName ?? ws?.name };
  }
  const r = await prisma.campaignRecipient.findUnique({ where: { trackingToken: token }, include: { campaign: { select: { ownerWorkspace: { select: { name: true, senderLegalName: true } } } } } });
  if (!r) return null;
  return { email: r.email, sender: r.campaign.ownerWorkspace.senderLegalName ?? r.campaign.ownerWorkspace.name, already: !!r.unsubscribedAt };
}

export async function unsubscribe(token, { source, ip, userAgent }) {
  if (token === 'test-preview') return { test: true };
  let ctx;
  if (token.startsWith('a.')) {
    const t = readAutomationToken(token);
    if (!t) return null;
    ctx = { accountId: t.accountId, workspaceId: t.workspaceId, email: t.email, campaignId: null, recipient: null };
  } else {
    const r = await recipientByToken(token);
    if (!r) return null;
    ctx = { accountId: r.campaign.accountId, workspaceId: r.campaign.ownerWorkspaceId, email: r.emailNormalized, campaignId: r.campaignId, recipient: r };
  }
  const now = new Date();
  await suppress(ctx.accountId, ctx.email, { reason: 'UNSUBSCRIBED', source, countryCode: ctx.recipient?.countryCode, campaignId: ctx.campaignId });
  const first = await recordEvent({ accountId: ctx.accountId, workspaceId: ctx.workspaceId, campaignId: ctx.campaignId, recipientId: ctx.recipient?.id, type: 'UNSUBSCRIBED', source, dedupeKey: `unsub:${hashEmail(ctx.email)}:${ctx.campaignId ?? 'automation'}`, ip, userAgent: userAgent?.slice(0, 300), occurredAt: now });
  if (first) {
    await prisma.unsubscribe.create({ data: { accountId: ctx.accountId, emailNormalized: ctx.email, emailHash: hashEmail(ctx.email), workspaceId: ctx.workspaceId, campaignId: ctx.campaignId, recipientId: ctx.recipient?.id, source, countryCode: ctx.recipient?.countryCode, ip, userAgent: userAgent?.slice(0, 300) } });
    await prisma.consentRecord.create({ data: { accountId: ctx.accountId, emailNormalized: ctx.email, emailHash: hashEmail(ctx.email), status: 'WITHDRAWN', source: 'unsubscribe', withdrawnAt: now, countryCode: ctx.recipient?.countryCode } });
    if (ctx.recipient) await prisma.campaignRecipient.update({ where: { id: ctx.recipient.id }, data: { unsubscribedAt: now } });
    // Stop pending automation emails to this person.
    await prisma.automationEnrollment.updateMany({ where: { emailNormalized: ctx.email, status: 'ACTIVE', automation: { accountId: ctx.accountId } }, data: { status: 'EXITED', exitReason: 'UNSUBSCRIBED' } });
  }
  return { email: ctx.email };
}

// ---------------------------------------------------------------- Amazon SES via SNS

const certCache = new Map();
const SNS_CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

async function fetchCert(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !SNS_CERT_HOST.test(u.hostname) || !u.pathname.endsWith('.pem')) throw new Error('untrusted SNS certificate URL');
  if (!certCache.has(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`certificate fetch failed (${res.status})`);
    certCache.set(url, await res.text());
  }
  return certCache.get(url);
}

export async function verifySnsMessage(m, fetcher = fetchCert) {
  const keys = m.Type === 'Notification' ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  const text = keys.filter((k) => m[k] !== undefined && m[k] !== null).map((k) => `${k}\n${m[k]}\n`).join('');
  const cert = await fetcher(m.SigningCertURL);
  const algo = m.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  return crypto.createVerify(algo).update(text, 'utf8').verify(cert, m.Signature, 'base64');
}

const stripId = (id) => String(id ?? '').replace(/^<|>$/g, '');

async function recipientForSes(mail) {
  const header = (name) => mail?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
  const token = header('X-Abacco-Recipient');
  if (token) {
    const r = await recipientByToken(token);
    if (r) return r;
  }
  const mid = stripId(mail?.commonHeaders?.messageId ?? header('Message-ID'));
  if (!mid) return null;
  return prisma.campaignRecipient.findFirst({ where: { OR: [{ messageId: `<${mid}>` }, { messageId: mid }] }, include: { campaign: { select: { id: true, accountId: true, ownerWorkspaceId: true, name: true } } } });
}

export async function handleSesNotification(message) {
  const n = typeof message === 'string' ? JSON.parse(message) : message;
  const type = n.notificationType ?? n.eventType;
  const r = await recipientForSes(n.mail);
  if (!r) {
    logger.info({ type, sesMessageId: n.mail?.messageId }, 'SES event for unknown message');
    return { matched: false };
  }
  const base = { accountId: r.campaign.accountId, workspaceId: r.campaign.ownerWorkspaceId, campaignId: r.campaignId, recipientId: r.id, smtpAccountId: r.smtpAccountId, source: 'SES_SNS', providerEventId: n.mail?.messageId };
  if (type === 'Delivery') {
    await recordEvent({ ...base, type: 'DELIVERED', dedupeKey: `ses:delivery:${r.id}`, occurredAt: new Date(n.delivery?.timestamp ?? Date.now()) });
  } else if (type === 'Bounce') {
    const permanent = n.bounce?.bounceType === 'Permanent';
    const fresh = await recordEvent({ ...base, type: permanent ? 'BOUNCED_HARD' : 'BOUNCED_SOFT', dedupeKey: `ses:bounce:${r.id}:${n.bounce?.feedbackId ?? ''}`, occurredAt: new Date(n.bounce?.timestamp ?? Date.now()), metadata: { bounceType: n.bounce?.bounceType, bounceSubType: n.bounce?.bounceSubType } });
    if (fresh && permanent) {
      await suppress(base.accountId, r.emailNormalized, { reason: 'HARD_BOUNCE', source: 'SES_SNS', countryCode: r.countryCode, campaignId: r.campaignId });
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'BOUNCED', bouncedAt: new Date() } });
    }
  } else if (type === 'Complaint') {
    const fresh = await recordEvent({ ...base, type: 'COMPLAINED', dedupeKey: `ses:complaint:${r.id}`, occurredAt: new Date(n.complaint?.timestamp ?? Date.now()), metadata: { feedbackType: n.complaint?.complaintFeedbackType } });
    if (fresh) await suppress(base.accountId, r.emailNormalized, { reason: 'COMPLAINT', source: 'SES_SNS', countryCode: r.countryCode, campaignId: r.campaignId });
  }
  return { matched: true, type };
}
