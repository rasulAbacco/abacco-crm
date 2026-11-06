import prisma from "../../prisma/client.js";
import { resolveWriteWorkspace } from "../../middleware/salesIdMiddleware.js";
import { AppError, conflict, notFound } from "../../utils/errors.js";
import { toSkipTake, toOrderBy } from "../../utils/pagination.js";
import { writeAudit } from "../../services/audit/auditService.js";
import { buildScopeWhere } from "../../utils/scope.js";
import { sanitizeEmailHtml } from "../../services/email/messageBuilder.js";
import { isSuppressed } from "../../services/email/suppressionService.js";
import { normalizeEmail } from "../../utils/normalize.js";

const scopeWhere = (scope) => ({
  accountId: scope.accountId,
  deletedAt: null,
  ...(scope.mode === "single" ? { ownerWorkspaceId: scope.workspaceId } : {}),
});
const INCLUDE = {
  steps: { orderBy: { position: "asc" } },
  ownerWorkspace: { select: { id: true, code: true, name: true } },
  smtpAccount: { select: { id: true, name: true, fromEmail: true } },
};

async function find(scope, id) {
  const a = await prisma.automation.findFirst({
    where: { id, ...scopeWhere(scope) },
    include: INCLUDE,
  });
  if (!a) throw notFound("Automation");
  return a;
}

function cleanSteps(steps) {
  return steps.map((s, position) => ({
    position,
    type: s.type,
    config:
      s.type === "SEND_EMAIL"
        ? { ...s.config, html: sanitizeEmailHtml(s.config.html) }
        : s.config,
  }));
}

async function checkSmtp(scope, workspaceId, smtpAccountId) {
  if (!smtpAccountId) return;
  const ok = await prisma.smtpAccount.findFirst({
    where: {
      id: smtpAccountId,
      accountId: scope.accountId,
      deletedAt: null,
      workspaces: { some: { workspaceId } },
    },
  });
  if (!ok)
    throw new AppError(
      400,
      "SMTP_NOT_ASSIGNED",
      "That SMTP account is not assigned to this Sales ID.",
    );
}

export async function list(scope, q) {
  const where = {
    ...scopeWhere(scope),
    ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.automation.findMany({
      where,
      include: { ...INCLUDE, _count: { select: { enrollments: true } } },
      orderBy: [toOrderBy(q.sort, ["createdAt", "name", "status"])],
      ...toSkipTake(q),
    }),
    prisma.automation.count({ where }),
  ]);
  return { items, total };
}

export async function get(scope, id) {
  const a = await find(scope, id);
  const [byStatus, failures] = await Promise.all([
    prisma.automationEnrollment.groupBy({
      by: ["status"],
      where: { automationId: id },
      _count: { _all: true },
    }),
    prisma.automationExecution.count({
      where: { status: "FAILED", enrollment: { automationId: id } },
    }),
  ]);
  return {
    ...a,
    enrollmentCounts: Object.fromEntries(
      byStatus.map((r) => [r.status, r._count._all]),
    ),
    failedExecutions: failures,
  };
}

export async function create(scope, { ownerWorkspaceId, steps, ...data }, ctx) {
  const ws = await resolveWriteWorkspace(scope, ownerWorkspaceId);
  await checkSmtp(scope, ws.id, data.smtpAccountId);
  const a = await prisma.automation.create({
    data: {
      ...data,
      accountId: scope.accountId,
      ownerWorkspaceId: ws.id,
      steps: { create: cleanSteps(steps) },
    },
  });
  await writeAudit({
    accountId: scope.accountId,
    workspaceId: ws.id,
    action: "automation.create",
    entityType: "Automation",
    entityId: a.id,
    after: { name: a.name, triggerType: a.triggerType },
    ctx,
  });
  return get(scope, a.id);
}

export async function update(scope, id, { steps, ...data }, ctx) {
  const a = await find(scope, id);
  if (a.status === "ACTIVE" && steps)
    throw conflict(
      "Pause the automation before changing its steps.",
      "AUTOMATION_ACTIVE",
    );
  await checkSmtp(scope, a.ownerWorkspaceId, data.smtpAccountId);
  await prisma.$transaction(async (tx) => {
    await tx.automation.update({ where: { id }, data });
    if (steps) {
      const running = await tx.automationEnrollment.count({
        where: { automationId: id, status: "ACTIVE" },
      });
      if (running)
        throw conflict(
          `${running} people are part-way through this automation. Wait for them to finish or exit them first.`,
          "ENROLLMENTS_ACTIVE",
        );
      await tx.automationStep.deleteMany({ where: { automationId: id } });
      await tx.automationStep.createMany({
        data: cleanSteps(steps).map((s) => ({ ...s, automationId: id })),
      });
    }
    await writeAudit(
      {
        accountId: scope.accountId,
        workspaceId: a.ownerWorkspaceId,
        action: "automation.update",
        entityType: "Automation",
        entityId: id,
        ctx,
      },
      tx,
    );
  });
  return get(scope, id);
}

export async function setStatus(scope, id, status, ctx) {
  const a = await find(scope, id);
  if (status === "ACTIVE") {
    if (!a.steps.length)
      throw new AppError(422, "NO_STEPS", "Add at least one step.");
    if (a.steps.some((s) => s.type === "SEND_EMAIL")) {
      const smtp = await prisma.smtpAccount.count({
        where: {
          accountId: a.accountId,
          deletedAt: null,
          isEnabled: true,
          workspaces: { some: { workspaceId: a.ownerWorkspaceId } },
          ...(a.smtpAccountId ? { id: a.smtpAccountId } : {}),
        },
      });
      if (!smtp)
        throw new AppError(
          422,
          "NO_SMTP",
          "Assign an enabled SMTP account to this Sales ID first.",
        );
    }
  }
  await prisma.automation.update({ where: { id }, data: { status } });
  await writeAudit({
    accountId: scope.accountId,
    workspaceId: a.ownerWorkspaceId,
    action: `automation.${status.toLowerCase()}`,
    entityType: "Automation",
    entityId: id,
    ctx,
  });
  return get(scope, id);
}

export async function remove(scope, id, ctx) {
  const a = await find(scope, id);
  await prisma.$transaction([
    prisma.automation.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    }),
    prisma.automationEnrollment.updateMany({
      where: { automationId: id, status: "ACTIVE" },
      data: { status: "EXITED", exitReason: "AUTOMATION_DELETED" },
    }),
  ]);
  await writeAudit({
    accountId: scope.accountId,
    workspaceId: a.ownerWorkspaceId,
    action: "automation.delete",
    entityType: "Automation",
    entityId: id,
    ctx,
  });
  return { deleted: true };
}

/** Adds people to an automation. Suppressed or email-less people are skipped. */
export async function enrollPeople(automation, people) {
  let enrolled = 0,
    skipped = 0;
  for (const p of people) {
    const email = normalizeEmail(p.email);
    if (!email || (await isSuppressed(automation.accountId, email))) {
      skipped++;
      continue;
    }
    const dedupeKey = automation.allowReentry
      ? `${automation.id}:${email}:${Date.now()}`
      : `${automation.id}:${email}`;
    const r = await prisma.automationEnrollment.createMany({
      data: [
        {
          automationId: automation.id,
          contactId: p.contactId ?? null,
          leadId: p.leadId ?? null,
          emailNormalized: email,
          dedupeKey,
          nextRunAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    if (r.count) enrolled++;
    else skipped++;
  }
  return { enrolled, skipped };
}

export async function enrollManual(
  scope,
  id,
  { contactIds = [], leadIds = [] },
  ctx,
) {
  const a = await find(scope, id);
  if (a.status !== "ACTIVE")
    throw conflict("Activate the automation first.", "AUTOMATION_INACTIVE");
  const [cw, lw] = await Promise.all([
    buildScopeWhere(scope, "CONTACT"),
    buildScopeWhere(scope, "LEAD"),
  ]);
  const contacts = contactIds.length
    ? await prisma.contact.findMany({
        where: { AND: [cw, { id: { in: contactIds } }] },
        select: { id: true, email: true },
      })
    : [];
  const leads = leadIds.length
    ? await prisma.lead.findMany({
        where: { AND: [lw, { id: { in: leadIds } }] },
        select: { id: true, email: true },
      })
    : [];
  const r = await enrollPeople(a, [
    ...contacts.map((c) => ({ contactId: c.id, email: c.email })),
    ...leads.map((l) => ({ leadId: l.id, email: l.email })),
  ]);
  await writeAudit({
    accountId: scope.accountId,
    workspaceId: a.ownerWorkspaceId,
    action: "automation.enroll",
    entityType: "Automation",
    entityId: id,
    metadata: r,
    ctx,
  });
  return r;
}

export async function enrollments(scope, id, q) {
  await find(scope, id);
  const where = { automationId: id };
  const [items, total] = await Promise.all([
    prisma.automationEnrollment.findMany({
      where,
      orderBy: { enrolledAt: "desc" },
      ...toSkipTake(q),
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, fullName: true } },
      },
    }),
    prisma.automationEnrollment.count({ where }),
  ]);
  return { items, total };
}

export async function executions(scope, id, q) {
  await find(scope, id);
  const where = {
    enrollment: { automationId: id },
    ...(q.status ? { status: q.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.automationExecution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(q),
      include: {
        step: { select: { position: true, type: true } },
        enrollment: { select: { emailNormalized: true } },
      },
    }),
    prisma.automationExecution.count({ where }),
  ]);
  return { items, total };
}
