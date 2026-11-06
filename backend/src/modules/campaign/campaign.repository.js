// Audience building and statistics for campaigns (Postgres is the source of truth).
import crypto from "node:crypto";
import prisma from "../../prisma/client.js";
import { hashEmail } from "../../utils/normalize.js";
import {
  suppressedHashes,
  consentedHashes,
} from "../../services/email/suppressionService.js";
import { idsWithTag } from "../../services/records/tagService.js";
import { computeSendTime } from "./campaign.scheduler.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ROLE_ORDER = { MAIN: 0, ALTERNATE: 1, ASSIGNED: 2, OTHER: 3 };

/**
 * Every SMTP account of the CRM, labelled for one Sales ID:
 * MAIN / ALTERNATE (set on the Sales ID), ASSIGNED (also assigned to it) or OTHER
 * (another Sales ID's email — usable only when the user picks it on purpose).
 */
export async function eligibleSmtpAccounts(db, accountId, workspaceId) {
  // Sequential on purpose: `db` may be a transaction client (one connection).
  const ws = await db.salesWorkspace.findUnique({
    where: { id: workspaceId },
    select: { primarySmtpAccountId: true, alternateSmtpAccountId: true },
  });
  const rows = await db.smtpAccount.findMany({
    where: { accountId, deletedAt: null },
    select: {
      id: true,
      name: true,
      fromEmail: true,
      fromName: true,
      provider: true,
      isEnabled: true,
      health: true,
      hourlyLimit: true,
      dailyLimit: true,
      unhealthyUntil: true,
      workspaces: {
        select: {
          workspace: { select: { id: true, code: true, deletedAt: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .map(({ workspaces, ...a }) => {
      const live = workspaces
        .map((w) => w.workspace)
        .filter((w) => !w.deletedAt);
      const role =
        a.id === ws?.primarySmtpAccountId
          ? "MAIN"
          : a.id === ws?.alternateSmtpAccountId
            ? "ALTERNATE"
            : live.some((w) => w.id === workspaceId)
              ? "ASSIGNED"
              : "OTHER";
      return { ...a, role, salesIds: live.map((w) => w.code) };
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

/** Loads list members (deduped by email) after the segment filter. */
export async function loadAudience(db, campaign, listIds) {
  const seg = campaign.segmentFilter ?? {};
  const contactWhere = { deletedAt: null, emailNormalized: { not: null } };
  if (seg.countryCodes?.length)
    contactWhere.countryCode = { in: seg.countryCodes };
  const and = [contactWhere];
  for (const t of seg.tags ?? [])
    and.push({
      id: { in: await idsWithTag(campaign.accountId, "CONTACT", t, db) },
    });
  for (const t of seg.excludeTags ?? [])
    and.push({
      id: { notIn: await idsWithTag(campaign.accountId, "CONTACT", t, db) },
    });
  const members = await db.emailListContact.findMany({
    where: {
      listId: { in: listIds },
      status: "SUBSCRIBED",
      contact: { AND: and },
    },
    select: {
      contact: {
        select: {
          id: true,
          email: true,
          emailNormalized: true,
          ccEmails: true,
          firstName: true,
          lastName: true,
          designation: true,
          city: true,
          countryCode: true,
          timezone: true,
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { addedAt: "asc" },
  });
  const seen = new Map();
  for (const { contact } of members)
    if (!seen.has(contact.emailNormalized))
      seen.set(contact.emailNormalized, contact);
  return [...seen.values()];
}

/** Classifies every audience member and computes its UTC send time. */
export async function planRecipients(
  db,
  campaign,
  workspace,
  account,
  contacts,
  now = new Date(),
) {
  const emails = contacts.map((c) => c.emailNormalized);
  // Sequential on purpose: `db` may be a transaction client (one connection).
  const suppressed = await suppressedHashes(campaign.accountId, emails, db);
  const consented = await consentedHashes(campaign.accountId, emails, db);
  const countries = await db.countryProfile.findMany({
    where: { accountId: campaign.accountId },
  });
  const holidays = await db.holiday.findMany({
    where: {
      accountId: campaign.accountId,
      date: { gte: new Date(now.getTime() - 86400000) },
    },
  });
  const settings = await db.salesWorkspaceSettings.findUnique({
    where: { workspaceId: workspace.id },
  });
  const byCountry = Object.fromEntries(countries.map((c) => [c.code, c]));
  const holidaySet = new Set(
    holidays.map(
      (h) => `${h.countryCode}:${h.date.toISOString().slice(0, 10)}`,
    ),
  );
  const fallbackTz =
    campaign.fallbackTimezone ??
    workspace.defaultTimezone ??
    account.defaultTimezone;

  return contacts.map((c) => {
    const profile = c.countryCode ? byCountry[c.countryCode] : null;
    const timezone = c.timezone ?? profile?.defaultTimezone ?? fallbackTz;
    const row = {
      campaignId: campaign.id,
      contactId: c.id,
      email: c.email ?? c.emailNormalized,
      emailNormalized: c.emailNormalized,
      countryCode: c.countryCode,
      recipientTimezone: timezone,
      trackingToken: crypto.randomBytes(18).toString("base64url"),
      mergeData: {
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company?.name,
        designation: c.designation,
        city: c.city,
      },
      ccEmails:
        campaign.includeCc === false
          ? []
          : [...new Set((c.ccEmails ?? []).map((e) => e.toLowerCase()))]
              .filter((e) => e !== c.emailNormalized)
              .slice(0, 5),
      status: "PENDING",
      skipReason: null,
      scheduledAtUtc: null,
    };
    const h = hashEmail(c.emailNormalized);
    if (!EMAIL_RE.test(c.emailNormalized))
      return { ...row, status: "SKIPPED", skipReason: "INVALID_EMAIL" };
    if (suppressed.has(h))
      return { ...row, status: "SUPPRESSED", skipReason: "SUPPRESSED" };
    if (profile?.requiresPriorConsent && !consented.has(h))
      return {
        ...row,
        status: "SKIPPED",
        skipReason: `NO_CONSENT_${profile.legalRegime}`,
      };
    const business = profile
      ? {
          start: profile.businessHoursStart,
          end: profile.businessHoursEnd,
          days: profile.businessDays,
        }
      : {
          start: settings?.businessHoursStart,
          end: settings?.businessHoursEnd,
          days: settings?.businessDays,
        };
    const t = computeSendTime(
      campaign,
      { timezone, countryCode: c.countryCode },
      { business, holidays: holidaySet, now },
    );
    if (t.skip) return { ...row, status: "SKIPPED", skipReason: t.skip };
    return { ...row, scheduledAtUtc: t.at };
  });
}

export function summarizePlan(rows) {
  const s = {
    total: rows.length,
    sendable: 0,
    suppressed: 0,
    skipped: {},
    byCountry: {},
    firstSendAt: null,
    lastSendAt: null,
  };
  for (const r of rows) {
    s.byCountry[r.countryCode ?? "—"] =
      (s.byCountry[r.countryCode ?? "—"] ?? 0) + 1;
    if (r.status === "PENDING") {
      s.sendable++;
      if (!s.firstSendAt || r.scheduledAtUtc < s.firstSendAt)
        s.firstSendAt = r.scheduledAtUtc;
      if (!s.lastSendAt || r.scheduledAtUtc > s.lastSendAt)
        s.lastSendAt = r.scheduledAtUtc;
    } else if (r.status === "SUPPRESSED") s.suppressed++;
    else s.skipped[r.skipReason] = (s.skipped[r.skipReason] ?? 0) + 1;
  }
  return s;
}

export async function campaignStats(campaignId) {
  const [
    byStatus,
    accepted,
    retried,
    opens,
    clicks,
    unsubs,
    delivered,
    complaints,
    bySmtp,
    events,
  ] = await Promise.all([
    prisma.campaignRecipient.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { _all: true },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, sentAt: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, attempts: { gt: 1 } },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, firstOpenedAt: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, firstClickedAt: { not: null } },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, unsubscribedAt: { not: null } },
    }),
    prisma.emailEvent.count({ where: { campaignId, type: "DELIVERED" } }),
    prisma.emailEvent.count({ where: { campaignId, type: "COMPLAINED" } }),
    prisma.campaignRecipient.groupBy({
      by: ["smtpAccountId", "status"],
      where: { campaignId, smtpAccountId: { not: null } },
      _count: { _all: true },
    }),
    prisma.$queryRaw`SELECT date_trunc('hour', "sentAt") AS hour, count(*)::int AS sent FROM campaign_recipients WHERE "campaignId" = ${campaignId}::uuid AND "sentAt" IS NOT NULL GROUP BY 1 ORDER BY 1`,
  ]);
  const counts = Object.fromEntries(
    [
      "PENDING",
      "QUEUED",
      "SENDING",
      "SENT",
      "FAILED",
      "BOUNCED",
      "SUPPRESSED",
      "UNSUBSCRIBED",
      "SKIPPED",
      "CANCELLED",
    ].map((s) => [s, 0]),
  );
  for (const r of byStatus) counts[r.status] = r._count._all;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const smtpIds = [...new Set(bySmtp.map((r) => r.smtpAccountId))];
  const smtpNames = Object.fromEntries(
    (
      await prisma.smtpAccount.findMany({
        where: { id: { in: smtpIds } },
        select: { id: true, name: true, fromEmail: true },
      })
    ).map((a) => [a.id, a]),
  );
  const perSmtp = {};
  for (const r of bySmtp)
    (perSmtp[r.smtpAccountId] ??= {
      ...smtpNames[r.smtpAccountId],
      counts: {},
    }).counts[r.status] = r._count._all;
  return {
    total,
    counts,
    accepted,
    retried,
    uniqueOpens: opens,
    uniqueClicks: clicks,
    unsubscribed: unsubs,
    deliveredEvents: delivered,
    complaints,
    rates: {
      bounceRate: rate(counts.BOUNCED, accepted),
      openRateEstimated: rate(opens, accepted),
      clickRate: rate(clicks, accepted),
      unsubscribeRate: rate(unsubs, accepted),
    },
    perSmtp: Object.values(perSmtp),
    sentPerHour: events.map((e) => ({ hour: e.hour, sent: e.sent })),
    notes: {
      accepted:
        "Accepted by the SMTP server. This is not proof of inbox delivery.",
      delivered:
        "Delivered counts come only from provider events (Amazon SES). Other providers do not report delivery.",
      opens:
        "Opens are estimates: image blocking hides some opens and privacy proxies (e.g. Apple Mail) create others.",
    },
  };
}
