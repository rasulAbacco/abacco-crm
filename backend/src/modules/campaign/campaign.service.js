import prisma from "../../prisma/client.js";
import { resolveWriteWorkspace } from "../../middleware/salesIdMiddleware.js";
import { AppError, conflict, notFound } from "../../utils/errors.js";
import { toOrderBy, toSkipTake } from "../../utils/pagination.js";
import { toMinor } from "../../utils/money.js";
import { writeAudit } from "../../services/audit/auditService.js";
import {
  sanitizeEmailHtml,
  extractLinks,
  urlHash,
  buildMessage,
} from "../../services/email/messageBuilder.js";
import {
  getTransport,
  safeSmtpError,
} from "../../services/email/smtpTransport.js";
import { reserveSlot } from "../../services/email/rateLimiter.js";
import {
  eligibleSmtpAccounts,
  loadAudience,
  planRecipients,
  summarizePlan,
  campaignStats,
} from "./campaign.repository.js";
import { nudgeDispatcher } from "./campaign.queue.js";

const WS = { select: { id: true, code: true, name: true } };
const scopeWhere = (scope) => ({
  accountId: scope.accountId,
  deletedAt: null,
  ...(scope.mode === "single" ? { ownerWorkspaceId: scope.workspaceId } : {}),
});
const DETAIL = {
  ownerWorkspace: WS,
  lists: { select: { list: { select: { id: true, name: true } } } },
  smtpAccounts: {
    select: {
      smtpAccount: {
        select: {
          id: true,
          name: true,
          fromEmail: true,
          provider: true,
          health: true,
          isEnabled: true,
        },
      },
    },
  },
  template: { select: { id: true, name: true } },
};

function shape(c) {
  const { lists, smtpAccounts, ...rest } = c;
  return {
    ...rest,
    lists: lists?.map((l) => l.list) ?? [],
    smtpAccounts: smtpAccounts?.map((s) => s.smtpAccount) ?? [],
  };
}

async function find(scope, id, db = prisma) {
  const c = await db.campaign.findFirst({
    where: { id, ...scopeWhere(scope) },
    include: DETAIL,
  });
  if (!c) throw notFound("Campaign");
  return c;
}

/** Converts API fields to columns; validates that lists / SMTP / template belong to the campaign's Sales ID. */
async function toData(scope, workspaceId, input, existing) {
  const {
    listIds,
    smtpAccountIds,
    scheduledAt,
    localSendDate,
    pitchAmount,
    pitchCurrency,
    ...rest
  } = input;
  const data = { ...rest };
  if (data.html !== undefined && data.html !== null)
    data.html = sanitizeEmailHtml(data.html);
  if (scheduledAt !== undefined) data.scheduledAtUtc = scheduledAt;
  if (localSendDate !== undefined)
    data.localSendDate = localSendDate
      ? new Date(`${localSendDate}T00:00:00Z`)
      : null;
  if (pitchAmount !== undefined || pitchCurrency !== undefined) {
    const cur = pitchCurrency ?? existing?.pitchCurrency;
    data.pitchCurrency = cur ?? null;
    data.pitchAmountMinor =
      pitchAmount && cur
        ? toMinor(pitchAmount, cur)
        : pitchAmount === null
          ? null
          : (existing?.pitchAmountMinor ?? null);
    if (pitchAmount && !cur)
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        "Choose the currency for the pitch amount.",
      );
  }
  if (data.templateId) {
    const t = await prisma.emailTemplate.findFirst({
      where: {
        id: data.templateId,
        accountId: scope.accountId,
        deletedAt: null,
        OR: [{ ownerWorkspaceId: workspaceId }, { ownerWorkspaceId: null }],
      },
    });
    if (!t)
      throw new AppError(
        400,
        "INVALID_TEMPLATE",
        "That template is not available to this Sales ID.",
      );
    if (data.html === undefined && !existing?.html) data.html = t.html;
    if (data.subject === undefined && !existing?.subject)
      data.subject = t.subject;
  }
  const relations = {};
  if (listIds) {
    const lists = await prisma.emailList.findMany({
      where: {
        id: { in: listIds },
        ownerWorkspaceId: workspaceId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (lists.length !== new Set(listIds).size)
      throw new AppError(
        400,
        "INVALID_LIST",
        "Every list must belong to the campaign's Sales ID.",
      );
    relations.listIds = listIds;
  }
  if (smtpAccountIds) {
    const allowed = await eligibleSmtpAccounts(
      prisma,
      scope.accountId,
      workspaceId,
    );
    const ok = new Set(allowed.map((a) => a.id));
    if (!smtpAccountIds.every((id) => ok.has(id)))
      throw new AppError(
        400,
        "SMTP_NOT_FOUND",
        "That email account does not exist. Add it under SMTP accounts first.",
      );
    relations.smtpAccountIds = smtpAccountIds;
  }
  return { data, relations };
}

async function writeRelations(tx, id, { listIds, smtpAccountIds }) {
  if (listIds) {
    await tx.campaignList.deleteMany({ where: { campaignId: id } });
    await tx.campaignList.createMany({
      data: listIds.map((listId) => ({ campaignId: id, listId })),
    });
  }
  if (smtpAccountIds) {
    await tx.campaignSmtpAccount.deleteMany({ where: { campaignId: id } });
    await tx.campaignSmtpAccount.createMany({
      data: smtpAccountIds.map((smtpAccountId) => ({
        campaignId: id,
        smtpAccountId,
      })),
    });
  }
}

// ---------------------------------------------------------------- CRUD

export async function list(scope, q) {
  const where = {
    ...scopeWhere(scope),
    ...(q.status ? { status: { in: q.status.split(",") } } : {}),
    ...(q.ownerWorkspaceId ? { ownerWorkspaceId: q.ownerWorkspaceId } : {}),
    ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: { ownerWorkspace: WS },
      orderBy: [
        toOrderBy(q.sort, ["createdAt", "name", "status", "startedAt"]),
      ],
      ...toSkipTake(q),
    }),
    prisma.campaign.count({ where }),
  ]);
  const ids = items.map((i) => i.id);
  const counts = await prisma.campaignRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: ids } },
    _count: { _all: true },
  });
  const progress = {};
  for (const r of counts)
    (progress[r.campaignId] ??= {})[r.status] = r._count._all;
  return {
    items: items.map((i) => ({
      ...i,
      html: undefined,
      text: undefined,
      progress: progress[i.id] ?? {},
    })),
    total,
  };
}

export async function get(scope, id) {
  return shape(await find(scope, id));
}

export async function create(scope, input, ctx) {
  const { ownerWorkspaceId, ...rest } = input;
  const ws = await resolveWriteWorkspace(scope, ownerWorkspaceId);
  // By default a campaign sends from the Sales ID's own main email.
  if (rest.smtpAccountIds === undefined) {
    const own = await prisma.salesWorkspace.findUnique({
      where: { id: ws.id },
      select: { primarySmtpAccountId: true },
    });
    if (own?.primarySmtpAccountId)
      rest.smtpAccountIds = [own.primarySmtpAccountId];
  }
  const { data, relations } = await toData(scope, ws.id, rest);
  const c = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        ...data,
        accountId: scope.accountId,
        ownerWorkspaceId: ws.id,
        createdById: ctx.userId,
      },
    });
    await writeRelations(tx, created.id, relations);
    await writeAudit(
      {
        accountId: scope.accountId,
        workspaceId: ws.id,
        action: "campaign.create",
        entityType: "Campaign",
        entityId: created.id,
        after: { name: created.name },
        ctx,
      },
      tx,
    );
    return created;
  });
  return get(scope, c.id);
}

export async function update(scope, id, input, ctx) {
  const c = await find(scope, id);
  if (c.status !== "DRAFT")
    throw conflict(
      "Only draft campaigns can be edited. Unschedule it first.",
      "NOT_DRAFT",
    );
  const { data, relations } = await toData(scope, c.ownerWorkspaceId, input, c);
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id }, data });
    await writeRelations(tx, id, relations);
    await writeAudit(
      {
        accountId: scope.accountId,
        workspaceId: c.ownerWorkspaceId,
        action: "campaign.update",
        entityType: "Campaign",
        entityId: id,
        ctx,
      },
      tx,
    );
  });
  return get(scope, id);
}

export async function remove(scope, id, ctx) {
  const c = await find(scope, id);
  if (["SCHEDULED", "QUEUED", "SENDING", "PAUSED"].includes(c.status))
    throw conflict(
      "Cancel the campaign before deleting it.",
      "CAMPAIGN_ACTIVE",
    );
  await prisma.campaign.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAudit({
    accountId: scope.accountId,
    workspaceId: c.ownerWorkspaceId,
    action: "campaign.delete",
    entityType: "Campaign",
    entityId: id,
    ctx,
  });
  return { deleted: true };
}

export async function duplicate(scope, id, ctx) {
  const c = await find(scope, id);
  const fields = [
    "description",
    "subject",
    "preheader",
    "fromName",
    "replyTo",
    "templateId",
    "html",
    "text",
    "segmentFilter",
    "trackOpens",
    "trackClicks",
    "scheduleMode",
    "fallbackTimezone",
    "pastTimeBehaviour",
    "respectBusinessHours",
    "pitchAmountMinor",
    "pitchCurrency",
    "pitchPriceNote",
  ];
  const copy = await prisma.$transaction(async (tx) => {
    const n = await tx.campaign.create({
      data: {
        ...Object.fromEntries(fields.map((f) => [f, c[f] ?? undefined])),
        name: `${c.name} (copy)`,
        accountId: c.accountId,
        ownerWorkspaceId: c.ownerWorkspaceId,
        createdById: ctx.userId,
      },
    });
    await writeRelations(tx, n.id, {
      listIds: c.lists.map((l) => l.list.id),
      smtpAccountIds: c.smtpAccounts.map((s) => s.smtpAccount.id),
    });
    return n;
  });
  return get(scope, copy.id);
}

// ---------------------------------------------------------------- launch checks

async function readiness(c) {
  const issues = [];
  if (!c.subject) issues.push("Add a subject line.");
  if (!c.html || !c.html.replace(/<[^>]*>/g, "").trim())
    issues.push("Add the email content.");
  if (!c.lists.length) issues.push("Choose at least one recipient list.");
  const ws = await prisma.salesWorkspace.findUnique({
    where: { id: c.ownerWorkspaceId },
    include: { account: true },
  });
  if (ws.status !== "ACTIVE") issues.push(`Sales ID ${ws.code} is not active.`);
  const assigned = await eligibleSmtpAccounts(
    prisma,
    c.accountId,
    c.ownerWorkspaceId,
  );
  const chosen = assigned.filter((a) =>
    c.smtpAccounts.some((s) => s.id === a.id),
  );
  if (!c.smtpAccounts.length)
    issues.push("Choose the email account to send from.");
  else if (!chosen.some((a) => a.isEnabled && a.health !== "AUTH_FAILED"))
    issues.push(
      `The sender ${c.smtpAccounts[0].fromEmail} is disabled or its sign-in failed. Test it under SMTP accounts, or choose the alternate email.`,
    );
  if (
    c.scheduleMode === "FIXED_TIME" &&
    (!c.scheduledAtUtc || c.scheduledAtUtc < new Date(Date.now() - 60000))
  )
    issues.push("Choose a future send time.");
  if (
    c.scheduleMode === "RECIPIENT_LOCAL" &&
    (!c.localSendDate || !c.localSendTime)
  )
    issues.push("Choose the local send date and time.");
  return { issues, workspace: ws, account: ws.account };
}

/** Dry run: who would receive it, who is excluded and why. Nothing is written. */
export async function preview(scope, id) {
  const c = shape(await find(scope, id));
  const { issues, workspace, account } = await readiness(c);
  const contacts = c.lists.length
    ? await loadAudience(
        prisma,
        c,
        c.lists.map((l) => l.id),
      )
    : [];
  const plan = await planRecipients(prisma, c, workspace, account, contacts);
  const smtp = await eligibleSmtpAccounts(
    prisma,
    c.accountId,
    c.ownerWorkspaceId,
  );
  const capacityPerDay = smtp
    .filter((a) => c.smtpAccounts.some((s) => s.id === a.id) && a.isEnabled)
    .reduce((s, a) => s + a.dailyLimit, 0);
  const summary = summarizePlan(plan);
  // How many list members the segment filter removed, so an empty audience is explained.
  const seg = c.segmentFilter ?? {};
  const hasSegment = Boolean(
    seg.countryCodes?.length || seg.tags?.length || seg.excludeTags?.length,
  );
  const inLists =
    hasSegment && c.lists.length
      ? (
          await loadAudience(
            prisma,
            { ...c, segmentFilter: null },
            c.lists.map((l) => l.id),
          )
        ).length
      : contacts.length;
  summary.inLists = inLists;
  summary.removedBySegment = inLists - contacts.length;
  if (c.lists.length && summary.sendable === 0) {
    if (inLists === 0)
      issues.push(
        "The selected lists have no subscribed members with an email address.",
      );
    else if (contacts.length === 0) {
      const parts = [
        seg.countryCodes?.length && `country is ${seg.countryCodes.join(", ")}`,
        seg.tags?.length && `tagged ${seg.tags.join(" + ")}`,
        seg.excludeTags?.length && `not tagged ${seg.excludeTags.join(", ")}`,
      ].filter(Boolean);
      issues.push(
        `None of the ${inLists} list members match the segment (${parts.join("; ")}). Remove or change the segment filters in step 2.`,
      );
    } else
      issues.push(
        'Every recipient is excluded (suppressed, no consent, or past send time). See "Excluded" below.',
      );
  }
  return {
    issues,
    summary,
    capacityPerDay,
    estimatedDays: capacityPerDay
      ? Math.ceil(summary.sendable / capacityPerDay)
      : null,
  };
}

/** Freezes the audience into campaign_recipients and starts (or schedules) sending. */
export async function launch(scope, id, ctx) {
  const c0 = shape(await find(scope, id));
  if (c0.status !== "DRAFT")
    throw conflict("This campaign has already been started.", "NOT_DRAFT");
  const { issues, workspace, account } = await readiness(c0);
  if (issues.length)
    throw new AppError(
      422,
      "CAMPAIGN_NOT_READY",
      "The campaign is not ready to send.",
      { issues },
    );

  const result = await prisma.$transaction(
    async (tx) => {
      const [locked] =
        await tx.$queryRaw`SELECT status FROM campaigns WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.status !== "DRAFT")
        throw conflict("This campaign has already been started.", "NOT_DRAFT");
      const contacts = await loadAudience(
        tx,
        c0,
        c0.lists.map((l) => l.id),
      );
      const plan = await planRecipients(tx, c0, workspace, account, contacts);
      const summary = summarizePlan(plan);
      if (!summary.sendable)
        throw new AppError(
          422,
          "NO_RECIPIENTS",
          "No recipient can receive this campaign.",
          { summary },
        );

      await tx.campaignRecipient.deleteMany({ where: { campaignId: id } });
      for (let i = 0; i < plan.length; i += 1000)
        await tx.campaignRecipient.createMany({
          data: plan.slice(i, i + 1000),
          skipDuplicates: true,
        });
      const links = extractLinks(c0.html);
      if (links.length)
        await tx.trackedLink.createMany({
          data: links.map((url) => ({
            campaignId: id,
            url,
            urlHash: urlHash(url),
          })),
          skipDuplicates: true,
        });

      const dueNow = plan.some(
        (r) =>
          r.status === "PENDING" &&
          r.scheduledAtUtc <= new Date(Date.now() + 30000),
      );
      const status = dueNow ? "SENDING" : "SCHEDULED";
      await tx.campaign.update({
        where: { id },
        data: {
          status,
          statusReason: null,
          startedAt: dueNow ? new Date() : null,
          scheduledAtUtc: c0.scheduledAtUtc ?? summary.firstSendAt,
        },
      });
      await writeAudit(
        {
          accountId: c0.accountId,
          workspaceId: c0.ownerWorkspaceId,
          action: "campaign.launch",
          entityType: "Campaign",
          entityId: id,
          metadata: { status, summary },
          ctx,
        },
        tx,
      );
      return { status, summary };
    },
    { timeout: 120_000 },
  );
  await nudgeDispatcher();
  return result;
}

// ---------------------------------------------------------------- lifecycle

async function transition(scope, id, from, to, ctx, extra = async () => {}) {
  const c = await find(scope, id);
  if (!from.includes(c.status))
    throw conflict(
      `A ${c.status.toLowerCase().replace(/_/g, " ")} campaign cannot be changed this way.`,
      "INVALID_STATE",
    );
  await prisma.$transaction(async (tx) => {
    const r = await tx.campaign.updateMany({
      where: { id, status: c.status },
      data: {
        status: to,
        ...(to === "CANCELLED" ? { cancelledAt: new Date() } : {}),
        statusReason: to === "PAUSED" ? "Paused by user" : null,
      },
    });
    if (r.count !== 1)
      throw conflict(
        "The campaign changed meanwhile. Reload and try again.",
        "CONCURRENT_CHANGE",
      );
    await extra(tx, c);
    await writeAudit(
      {
        accountId: c.accountId,
        workspaceId: c.ownerWorkspaceId,
        action: `campaign.${to.toLowerCase()}`,
        entityType: "Campaign",
        entityId: id,
        before: { status: c.status },
        after: { status: to },
        ctx,
      },
      tx,
    );
  });
  if (to === "SENDING") await nudgeDispatcher();
  return get(scope, id);
}

// Pausing returns queued (not yet claimed) recipients to PENDING; workers only claim while the campaign is SENDING.
export const pause = (scope, id, ctx) =>
  transition(
    scope,
    id,
    ["SENDING", "SCHEDULED", "QUEUED"],
    "PAUSED",
    ctx,
    (tx) =>
      tx.campaignRecipient.updateMany({
        where: { campaignId: id, status: "QUEUED" },
        data: { status: "PENDING" },
      }),
  );

export async function resume(scope, id, ctx) {
  const c = shape(await find(scope, id));
  const assigned = await eligibleSmtpAccounts(
    prisma,
    c.accountId,
    c.ownerWorkspaceId,
  );
  if (
    !assigned.some(
      (a) =>
        c.smtpAccounts.some((s) => s.id === a.id) &&
        a.isEnabled &&
        a.health !== "AUTH_FAILED",
    )
  ) {
    throw conflict(
      "The sender email is disabled or its sign-in failed. Fix it (SMTP accounts → Test) or choose another sender, then resume.",
      "NO_ELIGIBLE_SMTP",
    );
  }
  const future = await prisma.campaignRecipient.count({
    where: {
      campaignId: id,
      status: "PENDING",
      scheduledAtUtc: { lte: new Date() },
    },
  });
  return transition(
    scope,
    id,
    ["PAUSED"],
    future ? "SENDING" : "SCHEDULED",
    ctx,
  );
}

export const cancel = (scope, id, ctx) =>
  transition(
    scope,
    id,
    ["SCHEDULED", "QUEUED", "SENDING", "PAUSED"],
    "CANCELLED",
    ctx,
    (tx) =>
      tx.campaignRecipient.updateMany({
        where: { campaignId: id, status: { in: ["PENDING", "QUEUED"] } },
        data: { status: "CANCELLED", skipReason: "CAMPAIGN_CANCELLED" },
      }),
  );

export async function unschedule(scope, id, ctx) {
  const sent = await prisma.campaignRecipient.count({
    where: { campaignId: id, sentAt: { not: null } },
  });
  if (sent)
    throw conflict(
      "Sending has started; pause or cancel instead.",
      "ALREADY_SENDING",
    );
  return transition(scope, id, ["SCHEDULED"], "DRAFT", ctx, (tx) =>
    tx.campaignRecipient.deleteMany({ where: { campaignId: id } }),
  );
}

/** Puts FAILED recipients back in the queue (manual, never automatic after an unknown outcome). */
export async function retryFailed(scope, id, ctx) {
  const c = await find(scope, id);
  if (
    !["COMPLETED_WITH_ERRORS", "FAILED", "PAUSED", "SENDING"].includes(c.status)
  )
    throw conflict("Nothing to retry in this state.", "INVALID_STATE");
  const r = await prisma.$transaction(async (tx) => {
    const u = await tx.campaignRecipient.updateMany({
      where: { campaignId: id, status: "FAILED" },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: null,
        scheduledAtUtc: new Date(),
        lastError: null,
      },
    });
    if (u.count)
      await tx.campaign.update({
        where: { id },
        data: { status: "SENDING", statusReason: null, completedAt: null },
      });
    await writeAudit(
      {
        accountId: c.accountId,
        workspaceId: c.ownerWorkspaceId,
        action: "campaign.retry_failed",
        entityType: "Campaign",
        entityId: id,
        metadata: { count: u.count },
        ctx,
      },
      tx,
    );
    return u.count;
  });
  await nudgeDispatcher();
  return { requeued: r };
}

export async function stats(scope, id) {
  const c = await find(scope, id);
  return {
    campaign: {
      id: c.id,
      name: c.name,
      status: c.status,
      statusReason: c.statusReason,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
    },
    ...(await campaignStats(id)),
  };
}

export async function recipients(scope, id, q) {
  await find(scope, id);
  const where = {
    campaignId: id,
    ...(q.status ? { status: q.status } : {}),
    ...(q.q ? { email: { contains: q.q.toLowerCase() } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where,
      orderBy: [{ scheduledAtUtc: "asc" }, { createdAt: "asc" }],
      ...toSkipTake(q),
      select: {
        id: true,
        email: true,
        countryCode: true,
        recipientTimezone: true,
        scheduledAtUtc: true,
        status: true,
        skipReason: true,
        attempts: true,
        lastError: true,
        sentAt: true,
        firstOpenedAt: true,
        firstClickedAt: true,
        unsubscribedAt: true,
        bouncedAt: true,
        smtpAccount: { select: { name: true } },
      },
    }),
    prisma.campaignRecipient.count({ where }),
  ]);
  return { items, total };
}

/** Sends a preview to up to 5 addresses through one of the campaign's SMTP accounts. No tracking. */
export async function sendTest(scope, id, { to, smtpAccountId }, ctx) {
  const c = shape(await find(scope, id));
  if (!c.subject || !c.html)
    throw new AppError(
      422,
      "CAMPAIGN_NOT_READY",
      "Add a subject and content first.",
    );
  const pool = await prisma.smtpAccount.findMany({
    where: {
      accountId: c.accountId,
      deletedAt: null,
      isEnabled: true,
      ...(smtpAccountId
        ? { id: smtpAccountId }
        : { id: { in: c.smtpAccounts.map((s) => s.id) } }),
    },
  });
  const smtp = pool[0];
  if (!smtp)
    throw new AppError(
      400,
      "NO_SMTP",
      "Choose the email account to send from (it must be enabled).",
    );
  const ws = await prisma.salesWorkspace.findUnique({
    where: { id: c.ownerWorkspaceId },
    include: { account: true },
  });
  // A real subject line from the audience, so the test shows how follow-up subjects look.
  const sample = await prisma.contact.findFirst({
    where: {
      subjectLine: { not: null },
      deletedAt: null,
      listMemberships: {
        some: {
          listId: {
            in: (c.lists ?? [])
              .map((l) => l.listId ?? l.list?.id ?? l.id)
              .filter(Boolean),
          },
        },
      },
    },
    select: { subjectLine: true },
  });
  const results = [];
  for (const email of to) {
    const slot = await reserveSlot(smtp, `test:${id}:${email}:${Date.now()}`);
    if (!slot.ok) {
      results.push({
        to: email,
        ok: false,
        error: `Sending limit reached (${slot.window}).`,
      });
      continue;
    }
    const msg = buildMessage({
      campaign: {
        ...c,
        fromEmail: smtp.fromEmail,
        fromName: c.fromName ?? smtp.fromName,
        trackOpens: false,
        trackClicks: false,
      },
      recipient: {
        email,
        trackingToken: "test-preview",
        mergeData: {
          firstName: "Test",
          lastName: "Recipient",
          subjectLine: sample?.subjectLine,
        },
      },
      workspace: ws,
      account: ws.account,
    });
    msg.subject = `[Test] ${msg.subject}`;
    try {
      await getTransport(smtp).sendMail(msg);
      results.push({ to: email, ok: true });
    } catch (err) {
      results.push({ to: email, ok: false, error: safeSmtpError(err) });
    }
  }
  await writeAudit({
    accountId: c.accountId,
    workspaceId: c.ownerWorkspaceId,
    action: "campaign.test_send",
    entityType: "Campaign",
    entityId: id,
    metadata: { count: to.length, smtpAccountId: smtp.id },
    ctx,
  });
  return { smtpAccount: { id: smtp.id, name: smtp.name }, results };
}

export async function eligibleSmtp(scope, workspaceId) {
  const ws = await resolveWriteWorkspace(scope, workspaceId).catch(() => null);
  const id = ws?.id ?? scope.workspaceId;
  if (!id) return [];
  return eligibleSmtpAccounts(prisma, scope.accountId, id);
}
