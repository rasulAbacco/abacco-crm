// Campaign sending engine (runs in the worker process, never in the API).
//
// Guarantees
//  * Postgres campaign_recipients.status is the source of truth; Redis only carries jobs.
//  * A recipient is sent at most once: a worker must atomically move it QUEUED → SENDING
//    (only while the campaign is SENDING) before talking to SMTP.
//  * If a worker dies mid-send the outcome is unknown, so the row becomes FAILED with a clear
//    reason instead of being resent automatically ("Retry failed" is a deliberate user action).
//  * SMTP limits are rolling 1h / 24h windows enforced in Redis; accounts are never rotated to
//    get around a limit — a limited recipient simply waits.
//  * A campaign sends from the one account the user chose. If that account fails, the campaign
//    waits (temporary problem) or pauses (sign-in rejected) — it never switches to another address.
//  * CC addresses count against the sending limits like any recipient and are suppression-checked.
import os from "node:os";
import prisma from "../../prisma/client.js";
import logger from "../../config/logger.js";
import config from "../../config/environment.js";
import { QUEUES } from "../../queues/queueRegistry.js";
import { enqueueSends } from "./campaign.queue.js";
import { buildMessage } from "../../services/email/messageBuilder.js";
import {
  getTransport,
  classifySmtpError,
  safeSmtpError,
} from "../../services/email/smtpTransport.js";
import {
  reserveSlot,
  releaseSlot,
  recordUsage,
} from "../../services/email/rateLimiter.js";
import {
  suppress,
  isSuppressed,
} from "../../services/email/suppressionService.js";
import { notifyAccount } from "../notifications/notifications.service.js";

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const MAX_ATTEMPTS = 5;
const STALE_SENDING_MS = 10 * 60 * 1000;
const STALE_QUEUED_MS = 15 * 60 * 1000;
const BATCH = 500;

const backoff = (attempts) =>
  new Date(Date.now() + Math.min(60, 2 ** attempts) * 60 * 1000); // 2,4,8,16,32,60 min

// ------------------------------------------------------------------ dispatcher

/** One dispatcher pass. `enqueue` is injectable for tests. */
export async function dispatchTick({
  enqueue = enqueueSends,
  now = new Date(),
} = {}) {
  const summary = {
    recoveredUnknown: 0,
    requeuedLost: 0,
    started: 0,
    queued: 0,
    completed: 0,
  };

  // 1) Worker crashed after claiming: outcome unknown → FAILED (no automatic resend).
  const stale = await prisma.campaignRecipient.updateMany({
    where: {
      status: "SENDING",
      lockedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) },
    },
    data: {
      status: "FAILED",
      lastError:
        'UNKNOWN_OUTCOME: the worker stopped while sending. Not retried automatically to avoid a duplicate; use "Retry failed" if needed.',
      lockedAt: null,
      lockedBy: null,
    },
  });
  summary.recoveredUnknown = stale.count;

  // 2) Jobs lost from Redis (never claimed) → back to PENDING; safe because nothing was sent.
  const lost = await prisma.campaignRecipient.updateMany({
    where: {
      status: "QUEUED",
      queuedAt: { lt: new Date(now.getTime() - STALE_QUEUED_MS) },
    },
    data: { status: "PENDING" },
  });
  summary.requeuedLost = lost.count;

  // 3) Scheduled campaigns whose first recipients are due start sending.
  const due = await prisma.campaign.findMany({
    where: {
      status: "SCHEDULED",
      deletedAt: null,
      recipients: { some: { status: "PENDING", scheduledAtUtc: { lte: now } } },
    },
    select: { id: true },
  });
  for (const c of due) {
    const r = await prisma.campaign.updateMany({
      where: { id: c.id, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: now },
    });
    summary.started += r.count;
  }

  // 4) Queue due recipients of sending campaigns (PENDING → QUEUED atomically, then add jobs).
  const sending = await prisma.campaign.findMany({
    where: { status: "SENDING", deletedAt: null },
    select: { id: true, accountId: true, name: true },
  });
  for (const c of sending) {
    const rows = await prisma.$queryRaw`
      UPDATE campaign_recipients SET status = 'QUEUED', "queuedAt" = ${now}, "updatedAt" = ${now}
      WHERE id IN (
        SELECT id FROM campaign_recipients
        WHERE "campaignId" = ${c.id}::uuid AND status = 'PENDING'
          AND "scheduledAtUtc" <= ${now} AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
        ORDER BY "scheduledAtUtc" LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED)
      RETURNING id, attempts, "queuedAt"`;
    if (rows.length) {
      try {
        await enqueue(rows);
        summary.queued += rows.length;
      } catch (err) {
        // Redis down: put them back so nothing is stranded.
        await prisma.campaignRecipient.updateMany({
          where: { id: { in: rows.map((r) => r.id) }, status: "QUEUED" },
          data: { status: "PENDING" },
        });
        throw err;
      }
    }

    // 5) Completion: nothing left to send.
    const open = await prisma.campaignRecipient.count({
      where: {
        campaignId: c.id,
        status: { in: ["PENDING", "QUEUED", "SENDING"] },
      },
    });
    if (open === 0) {
      const [failed, accepted] = await Promise.all([
        prisma.campaignRecipient.count({
          where: { campaignId: c.id, status: "FAILED" },
        }),
        prisma.campaignRecipient.count({
          where: { campaignId: c.id, sentAt: { not: null } },
        }),
      ]);
      const status =
        accepted === 0 && failed > 0
          ? "FAILED"
          : failed > 0
            ? "COMPLETED_WITH_ERRORS"
            : "COMPLETED";
      const r = await prisma.campaign.updateMany({
        where: { id: c.id, status: "SENDING" },
        data: { status, completedAt: now },
      });
      if (r.count) {
        summary.completed++;
        await notifyAccount(c.accountId, {
          type: "campaign.completed",
          title: `Campaign "${c.name}" finished`,
          body: `${accepted} accepted, ${failed} failed.`,
          link: `/campaigns/${c.id}`,
        });
      }
    }
  }
  return summary;
}

// ------------------------------------------------------------------ sender

async function pauseCampaign(campaignId, reason) {
  const r = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "SENDING" },
    data: { status: "PAUSED", statusReason: reason },
  });
  await prisma.campaignRecipient.updateMany({
    where: { campaignId, status: "QUEUED" },
    data: { status: "PENDING" },
  });
  if (r.count) {
    const c = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { accountId: true, name: true },
    });
    await notifyAccount(c.accountId, {
      type: "campaign.paused",
      title: `Campaign "${c.name}" paused`,
      body: reason,
      link: `/campaigns/${campaignId}`,
    });
    logger.warn({ campaignId, reason }, "campaign paused automatically");
  }
}

async function release(recipientId, data) {
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { lockedAt: null, lockedBy: null, ...data },
  });
}

/** Reserves one slot per address (recipient + CCs); all or nothing. */
async function reserveSlots(account, members) {
  const got = [];
  for (const m of members) {
    const slot = await reserveSlot(account, m);
    if (!slot.ok) {
      for (const g of got) await releaseSlot(account, g);
      return slot;
    }
    got.push(m);
  }
  return { ok: true };
}

/** Uses the campaign's chosen SMTP account and reserves rate-limit slots on it. */
async function pickAccount(campaign, recipient, ccCount = 0) {
  const now = new Date();
  const chosen = await prisma.smtpAccount.findMany({
    where: {
      id: { in: campaign.smtpAccounts.map((s) => s.smtpAccountId) },
      accountId: campaign.accountId,
      deletedAt: null,
      isEnabled: true,
      health: { not: "AUTH_FAILED" },
    },
  });
  const accounts = chosen.filter(
    (a) => !a.unhealthyUntil || a.unhealthyUntil < now,
  );
  if (!accounts.length) {
    // Only temporarily unhealthy (connection problems): wait for it instead of pausing or switching.
    const back = chosen
      .map((a) => a.unhealthyUntil)
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    return back
      ? {
          limitedUntil: back,
          reason: "Waiting: the sender email had connection problems",
        }
      : { none: "NO_ELIGIBLE_SMTP" };
  }
  // Keep the previously assigned account first, then spread by least-recently-used.
  accounts.sort((a, b) =>
    a.id === recipient.smtpAccountId
      ? -1
      : b.id === recipient.smtpAccountId
        ? 1
        : (a.lastUsedAt?.getTime() ?? 0) - (b.lastUsedAt?.getTime() ?? 0),
  );
  let earliest = null;
  for (const a of accounts) {
    const member = `${recipient.id}:${recipient.attempts}`;
    const members = [
      member,
      ...Array.from({ length: ccCount }, (_, i) => `${member}:cc${i}`),
    ];
    const slot = await reserveSlots(a, members);
    if (slot.ok) return { account: a, member, members };
    if (!earliest || slot.retryAt < earliest) earliest = slot.retryAt;
  }
  return { limitedUntil: earliest };
}

export async function processRecipient(
  recipientId,
  { workerId = WORKER_ID } = {},
) {
  // Atomic claim: only one worker can move this row to SENDING, and only while the campaign is sending.
  const claimed = await prisma.$queryRaw`
    UPDATE campaign_recipients r SET status = 'SENDING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = r.attempts + 1, "updatedAt" = now()
    FROM campaigns c
    WHERE r.id = ${recipientId}::uuid AND r.status = 'QUEUED' AND c.id = r."campaignId" AND c.status = 'SENDING'
    RETURNING r.*`;
  if (!claimed.length) return { skipped: "NOT_CLAIMABLE" };
  const recipient = claimed[0];

  const campaign = await prisma.campaign.findUnique({
    where: { id: recipient.campaignId },
    include: {
      smtpAccounts: true,
      links: true,
      ownerWorkspace: { include: { account: true } },
    },
  });

  // Last-moment suppression check (someone may have unsubscribed since the campaign started).
  const sup = await isSuppressed(campaign.accountId, recipient.emailNormalized);
  if (sup) {
    await release(recipient.id, {
      status: "SUPPRESSED",
      skipReason: `SUPPRESSED_${sup}`,
      attempts: recipient.attempts - 1,
    });
    return { status: "SUPPRESSED" };
  }

  // CC addresses: never to anyone unsubscribed / suppressed, never the recipient again.
  const cc = [];
  for (const e of recipient.ccEmails ?? []) {
    const n = String(e).trim().toLowerCase();
    if (!n || n === recipient.emailNormalized || cc.includes(n)) continue;
    if (!(await isSuppressed(campaign.accountId, n))) cc.push(n);
  }

  const pick = await pickAccount(campaign, recipient, cc.length);
  if (pick.none) {
    await release(recipient.id, {
      status: "PENDING",
      attempts: recipient.attempts - 1,
    });
    await pauseCampaign(
      campaign.id,
      "The sender email is disabled or its sign-in was rejected. Fix it under SMTP accounts (or choose another sender), then resume. Emails are not moved to another address automatically.",
    );
    return { status: "PAUSED" };
  }
  if (pick.limitedUntil) {
    // Sending limit reached (or sender temporarily failing): wait instead of switching to another address.
    await release(recipient.id, {
      status: "PENDING",
      attempts: recipient.attempts - 1,
      nextAttemptAt: pick.limitedUntil,
      lastError: pick.reason ?? "Waiting for SMTP sending limit window",
    });
    return { status: "RATE_LIMITED", until: pick.limitedUntil };
  }
  const { account, members } = pick;

  // Message-ID is written before sending, so a later bounce/complaint can be matched.
  const domain = account.fromEmail.split("@")[1] ?? "abacco.local";
  const messageId = `<${recipient.id}.${recipient.attempts}@${domain}>`;
  await prisma.campaignRecipient.update({
    where: { id: recipient.id },
    data: { messageId, smtpAccountId: account.id },
  });

  const msg = buildMessage({
    campaign: {
      ...campaign,
      fromEmail: account.fromEmail,
      fromName: campaign.fromName ?? account.fromName,
    },
    recipient,
    workspace: campaign.ownerWorkspace,
    account: campaign.ownerWorkspace.account,
    links: new Map(campaign.links.map((l) => [l.url, l.id])),
    messageId,
  });
  if (cc.length) msg.cc = cc;

  try {
    const info = await getTransport(account).sendMail(msg);
    const now = new Date();
    await prisma.$transaction([
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "SENT",
          sentAt: now,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      }),
      prisma.emailEvent.create({
        data: {
          accountId: campaign.accountId,
          workspaceId: campaign.ownerWorkspaceId,
          campaignId: campaign.id,
          recipientId: recipient.id,
          smtpAccountId: account.id,
          type: "ACCEPTED",
          source: "SMTP",
          dedupeKey: `accepted:${recipient.id}`,
          providerEventId: info.messageId ?? null,
          occurredAt: now,
          metadata: { response: String(info.response ?? "").slice(0, 200) },
        },
      }),
      prisma.smtpAccount.update({
        where: { id: account.id },
        data: {
          lastUsedAt: now,
          consecutiveFailures: 0,
          health: "HEALTHY",
          unhealthyUntil: null,
        },
      }),
    ]);
    await recordUsage(account.id, { sent: 1 + cc.length });
    return { status: "SENT", smtpAccountId: account.id };
  } catch (err) {
    const { kind, hardBounce } = classifySmtpError(err);
    const error = `${kind}: ${safeSmtpError(err)}`;
    logger.warn(
      { recipientId: recipient.id, smtpAccountId: account.id, kind, error },
      "send failed",
    );
    await recordUsage(account.id, { failed: 1 });

    if (kind === "AUTH" || kind === "CONNECTION" || kind === "RATE_LIMITED") {
      // Not sent: give the slots back, mark the account, retry the recipient later from the same sender.
      for (const m of members) await releaseSlot(account, m);
      const failures = account.consecutiveFailures + 1;
      await prisma.smtpAccount.update({
        where: { id: account.id },
        data:
          kind === "AUTH"
            ? {
                health: "AUTH_FAILED",
                lastError: error,
                consecutiveFailures: failures,
              }
            : {
                consecutiveFailures: failures,
                lastError: error,
                ...(failures >= 3 || kind === "RATE_LIMITED"
                  ? {
                      health: "UNHEALTHY",
                      unhealthyUntil: new Date(
                        Date.now() +
                          (kind === "RATE_LIMITED" ? 60 : 15) * 60000,
                      ),
                    }
                  : {}),
              },
      });
      if (kind === "AUTH")
        await notifyAccount(campaign.accountId, {
          type: "smtp.auth_failed",
          title: `SMTP sign-in failed: ${account.name}`,
          body: "Update the password / app password and test the account.",
          link: "/smtp-accounts",
        });
      const giveUp = recipient.attempts >= MAX_ATTEMPTS;
      await release(
        recipient.id,
        giveUp
          ? { status: "FAILED", lastError: error }
          : {
              status: "PENDING",
              lastError: error,
              nextAttemptAt:
                kind === "AUTH" ? new Date() : backoff(recipient.attempts),
              smtpAccountId: null,
            },
      );
      return { status: giveUp ? "FAILED" : "RETRY", kind };
    }
    if (kind === "PERMANENT") {
      if (hardBounce) {
        await suppress(campaign.accountId, recipient.emailNormalized, {
          reason: "HARD_BOUNCE",
          source: "SMTP",
          countryCode: recipient.countryCode,
          campaignId: campaign.id,
          note: error.slice(0, 200),
        });
        await prisma.emailEvent.create({
          data: {
            accountId: campaign.accountId,
            workspaceId: campaign.ownerWorkspaceId,
            campaignId: campaign.id,
            recipientId: recipient.id,
            smtpAccountId: account.id,
            type: "BOUNCED_HARD",
            source: "SMTP",
            dedupeKey: `bounce:${recipient.id}`,
            occurredAt: new Date(),
            metadata: { error },
          },
        });
      }
      await release(recipient.id, {
        status: hardBounce ? "BOUNCED" : "FAILED",
        bouncedAt: hardBounce ? new Date() : null,
        lastError: error,
      });
      return { status: hardBounce ? "BOUNCED" : "FAILED" };
    }
    // TEMPORARY (4xx): retry later with backoff.
    const giveUp = recipient.attempts >= MAX_ATTEMPTS;
    await release(
      recipient.id,
      giveUp
        ? { status: "FAILED", lastError: error }
        : {
            status: "PENDING",
            lastError: error,
            nextAttemptAt: backoff(recipient.attempts),
          },
    );
    return { status: giveUp ? "FAILED" : "RETRY", kind };
  }
}

// ------------------------------------------------------------------ registration

export function register(workerManager) {
  workerManager.register(QUEUES.CAMPAIGN_DISPATCH, async () => dispatchTick(), {
    concurrency: 1,
  });
  workerManager.every(QUEUES.CAMPAIGN_DISPATCH, "campaign-dispatch", 15_000);
  workerManager.register(
    QUEUES.EMAIL_SEND,
    async (job) => processRecipient(job.data.recipientId),
    {
      concurrency: Number(process.env.WORKER_SEND_CONCURRENCY ?? 4),
    },
  );
  logger.info(
    { workerId: WORKER_ID, apiPublicUrl: config.API_PUBLIC_URL },
    "campaign workers registered",
  );
}
