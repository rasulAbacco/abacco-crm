// Runs automation steps for enrollments that are due. Each step execution has
// an idempotency key (enrollment:step) so a crash or retry never sends twice.
import prisma from '../../prisma/client.js';
import logger from '../../config/logger.js';
import { QUEUES } from '../../queues/queueRegistry.js';
import { buildMessage } from '../../services/email/messageBuilder.js';
import { getTransport, classifySmtpError, safeSmtpError } from '../../services/email/smtpTransport.js';
import { reserveSlot, releaseSlot, recordUsage } from '../../services/email/rateLimiter.js';
import { isSuppressed, consentedHashes } from '../../services/email/suppressionService.js';
import { automationUnsubToken } from '../tracking/tracking.service.js';
import { hashEmail } from '../../utils/normalize.js';

const LEASE_MS = 5 * 60 * 1000;
const UNIT_MS = { minutes: 60000, hours: 3600000, days: 86400000 };

async function advance(e, nextRunAt = new Date()) {
  await prisma.automationEnrollment.update({ where: { id: e.id }, data: { currentPosition: e.currentPosition + 1, nextRunAt } });
}

async function person(e) {
  if (e.contactId) {
    const c = await prisma.contact.findUnique({ where: { id: e.contactId }, include: { company: { select: { name: true } } } });
    return c && { email: c.email, firstName: c.firstName, lastName: c.lastName, company: c.company?.name, designation: c.designation, city: c.city, countryCode: c.countryCode };
  }
  if (e.leadId) {
    const l = await prisma.lead.findUnique({ where: { id: e.leadId } });
    return l && { email: l.email, firstName: l.firstName ?? l.fullName, lastName: l.lastName, company: l.companyName, designation: l.designation, city: l.city, countryCode: l.countryCode };
  }
  return null;
}

async function sendEmailStep(a, e, step, exec) {
  const p = await person(e);
  if (!p?.email) return { skip: 'NO_EMAIL' };
  if (await isSuppressed(a.accountId, p.email)) return { exit: 'SUPPRESSED' };
  if (p.countryCode) {
    const profile = await prisma.countryProfile.findUnique({ where: { accountId_code: { accountId: a.accountId, code: p.countryCode } } });
    if (profile?.requiresPriorConsent && !(await consentedHashes(a.accountId, [p.email])).has(hashEmail(p.email))) return { exit: `NO_CONSENT_${profile.legalRegime}` };
  }
  const accounts = await prisma.smtpAccount.findMany({ where: { accountId: a.accountId, deletedAt: null, isEnabled: true, health: { not: 'AUTH_FAILED' }, OR: [{ unhealthyUntil: null }, { unhealthyUntil: { lt: new Date() } }], workspaces: { some: { workspaceId: a.ownerWorkspaceId } }, ...(a.smtpAccountId ? { id: a.smtpAccountId } : {}) } });
  if (!accounts.length) return { wait: new Date(Date.now() + 30 * 60000), error: 'No usable SMTP account' };
  let account, member, retryAt;
  for (const acc of accounts) {
    member = `auto:${exec.id}:${exec.attempts}`;
    const slot = await reserveSlot(acc, member);
    if (slot.ok) { account = acc; break; }
    retryAt = !retryAt || slot.retryAt < retryAt ? slot.retryAt : retryAt;
  }
  if (!account) return { wait: retryAt, error: 'Sending limit reached' };

  const ws = await prisma.salesWorkspace.findUnique({ where: { id: a.ownerWorkspaceId }, include: { account: true } });
  const messageId = `<auto.${exec.id}@${account.fromEmail.split('@')[1]}>`;
  const msg = buildMessage({
    campaign: { subject: step.config.subject, html: step.config.html, fromEmail: account.fromEmail, fromName: step.config.fromName ?? account.fromName, trackOpens: false, trackClicks: false },
    recipient: { email: p.email, trackingToken: automationUnsubToken({ accountId: a.accountId, workspaceId: a.ownerWorkspaceId, email: p.email }), mergeData: p, countryCode: p.countryCode },
    workspace: ws,
    account: ws.account,
    messageId,
  });
  try {
    await getTransport(account).sendMail(msg);
    await prisma.emailEvent.create({ data: { accountId: a.accountId, workspaceId: a.ownerWorkspaceId, smtpAccountId: account.id, automationExecId: exec.id, type: 'ACCEPTED', source: 'SMTP', dedupeKey: `auto-accepted:${exec.id}`, occurredAt: new Date() } });
    await prisma.smtpAccount.update({ where: { id: account.id }, data: { lastUsedAt: new Date(), consecutiveFailures: 0, health: 'HEALTHY' } });
    await recordUsage(account.id, { sent: 1 });
    return { sent: messageId };
  } catch (err) {
    const { kind } = classifySmtpError(err);
    if (kind !== 'PERMANENT' && kind !== 'TEMPORARY') await releaseSlot(account, member);
    if (kind === 'AUTH') await prisma.smtpAccount.update({ where: { id: account.id }, data: { health: 'AUTH_FAILED', lastError: safeSmtpError(err) } });
    await recordUsage(account.id, { failed: 1 });
    return { error: `${kind}: ${safeSmtpError(err)}`, permanent: kind === 'PERMANENT' };
  }
}

export async function processEnrollment(enrollmentId) {
  // Lease: whoever moves nextRunAt forward owns this run.
  const claimed = await prisma.automationEnrollment.updateMany({ where: { id: enrollmentId, status: 'ACTIVE', nextRunAt: { lte: new Date() } }, data: { nextRunAt: new Date(Date.now() + LEASE_MS) } });
  if (!claimed.count) return { skipped: true };
  const e = await prisma.automationEnrollment.findUnique({ where: { id: enrollmentId }, include: { automation: { include: { steps: { orderBy: { position: 'asc' } } } } } });
  const a = e.automation;
  if (a.status !== 'ACTIVE' || a.deletedAt) {
    await prisma.automationEnrollment.update({ where: { id: e.id }, data: { nextRunAt: new Date(Date.now() + 15 * 60000) } });
    return { waiting: 'AUTOMATION_NOT_ACTIVE' };
  }
  const step = a.steps.find((s) => s.position === e.currentPosition) ?? a.steps[e.currentPosition];
  if (!step) {
    await prisma.automationEnrollment.update({ where: { id: e.id }, data: { status: 'COMPLETED', completedAt: new Date(), nextRunAt: null } });
    return { completed: true };
  }
  const key = `${e.id}:${step.id}`;
  let exec = await prisma.automationExecution.findUnique({ where: { idempotencyKey: key } });
  if (exec?.status === 'SUCCEEDED' || exec?.status === 'SKIPPED') { await advance(e); return { advanced: true }; }
  if (exec?.status === 'RUNNING' && exec.startedAt > new Date(Date.now() - LEASE_MS)) return { running: true };
  if (exec?.status === 'RUNNING') {
    // Previous run stopped mid-step; for emails the outcome is unknown, so do not resend.
    await prisma.automationExecution.update({ where: { id: exec.id }, data: { status: 'FAILED', error: 'UNKNOWN_OUTCOME: worker stopped during this step', finishedAt: new Date() } });
    await prisma.automationEnrollment.update({ where: { id: e.id }, data: { status: 'FAILED', exitReason: 'UNKNOWN_OUTCOME' } });
    return { failed: true };
  }
  exec = exec
    ? await prisma.automationExecution.update({ where: { id: exec.id }, data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date() } })
    : await prisma.automationExecution.create({ data: { enrollmentId: e.id, stepId: step.id, idempotencyKey: key, status: 'RUNNING', attempts: 1, startedAt: new Date() } });

  const done = (status, data = {}) => prisma.automationExecution.update({ where: { id: exec.id }, data: { status, finishedAt: new Date(), ...data } });
  try {
    if (step.type === 'WAIT') {
      await done('SUCCEEDED');
      await advance(e, new Date(Date.now() + step.config.amount * UNIT_MS[step.config.unit]));
    } else if (step.type === 'CREATE_TASK') {
      await prisma.task.create({ data: { accountId: a.accountId, ownerWorkspaceId: a.ownerWorkspaceId, title: step.config.title, priority: step.config.priority ?? 'MEDIUM', dueAt: new Date(Date.now() + (step.config.dueInDays ?? 1) * 86400000), contactId: e.contactId, leadId: e.leadId, type: 'FOLLOW_UP' } });
      await done('SUCCEEDED');
      await advance(e);
    } else if (step.type === 'UPDATE_FIELD') {
      if (e.leadId) await prisma.lead.update({ where: { id: e.leadId }, data: { [step.config.field]: step.config.value } });
      await done(e.leadId ? 'SUCCEEDED' : 'SKIPPED', e.leadId ? {} : { error: 'Only leads have status/priority' });
      await advance(e);
    } else if (step.type === 'SEND_EMAIL') {
      const r = await sendEmailStep(a, e, step, exec);
      if (r.sent) { await done('SUCCEEDED', { messageId: r.sent }); await advance(e); }
      else if (r.skip) { await done('SKIPPED', { error: r.skip }); await advance(e); }
      else if (r.exit) { await done('SKIPPED', { error: r.exit }); await prisma.automationEnrollment.update({ where: { id: e.id }, data: { status: 'EXITED', exitReason: r.exit, nextRunAt: null } }); }
      else if (r.wait) { await prisma.automationExecution.update({ where: { id: exec.id }, data: { status: 'PENDING', attempts: { decrement: 1 }, error: r.error } }); await prisma.automationEnrollment.update({ where: { id: e.id }, data: { nextRunAt: r.wait } }); }
      else if (r.permanent || exec.attempts >= 3) { await done('FAILED', { error: r.error }); await prisma.automationEnrollment.update({ where: { id: e.id }, data: { status: 'FAILED', exitReason: r.error?.slice(0, 200), nextRunAt: null } }); }
      else { await prisma.automationExecution.update({ where: { id: exec.id }, data: { status: 'PENDING', error: r.error } }); await prisma.automationEnrollment.update({ where: { id: e.id }, data: { nextRunAt: new Date(Date.now() + 2 ** exec.attempts * 5 * 60000) } }); }
    }
  } catch (err) {
    logger.error({ err, enrollmentId }, 'automation step failed');
    await done('FAILED', { error: String(err.message).slice(0, 300) });
    await prisma.automationEnrollment.update({ where: { id: e.id }, data: { status: 'FAILED', exitReason: 'STEP_ERROR', nextRunAt: null } });
  }
  return { processed: true };
}

export async function automationTick(limit = 200) {
  const due = await prisma.automationEnrollment.findMany({ where: { status: 'ACTIVE', nextRunAt: { lte: new Date() }, automation: { status: 'ACTIVE', deletedAt: null } }, select: { id: true }, take: limit, orderBy: { nextRunAt: 'asc' } });
  for (const { id } of due) await processEnrollment(id);
  return { processed: due.length };
}

export function register(workerManager) {
  workerManager.register(QUEUES.AUTOMATION, async () => automationTick(), { concurrency: 1 });
  workerManager.every(QUEUES.AUTOMATION, 'automation-tick', 30_000);
}
