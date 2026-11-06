import prisma from "../../prisma/client.js";
import { AppError, conflict, notFound } from "../../utils/errors.js";
import { toOrderBy, toSkipTake } from "../../utils/pagination.js";
import { writeAudit } from "../../services/audit/auditService.js";
import { workspaceStats } from "./salesId.repository.js";

export const DEFAULT_STAGES = [
  { name: "New", probability: 10, kind: "OPEN" },
  { name: "Contacted", probability: 20, kind: "OPEN" },
  { name: "Qualified", probability: 40, kind: "OPEN" },
  { name: "Proposal", probability: 60, kind: "OPEN" },
  { name: "Negotiation", probability: 80, kind: "OPEN" },
  { name: "Won", probability: 100, kind: "WON" },
  { name: "Lost", probability: 0, kind: "LOST" },
];

const PUBLIC_FIELDS = {
  id: true,
  code: true,
  name: true,
  description: true,
  status: true,
  isDefault: true,
  color: true,
  defaultCurrency: true,
  defaultTimezone: true,
  senderLegalName: true,
  senderPostalAddress: true,
  primarySmtpAccountId: true,
  alternateSmtpAccountId: true,
  primarySmtp: {
    select: {
      id: true,
      name: true,
      fromEmail: true,
      provider: true,
      health: true,
      isEnabled: true,
    },
  },
  alternateSmtp: {
    select: {
      id: true,
      name: true,
      fromEmail: true,
      provider: true,
      health: true,
      isEnabled: true,
    },
  },
  createdAt: true,
  updatedAt: true,
};

function formatCode(n) {
  return `SID-${String(n).padStart(3, "0")}`;
}

// Codes are never reused, even after a Sales ID is deleted.
async function nextCode(tx, accountId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-id-code:${accountId}`}))`;
  const rows = await tx.$queryRaw`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '\\D', '', 'g'), '')::int), 0) AS max
    FROM sales_workspaces WHERE "accountId" = ${accountId}::uuid`;
  return formatCode(Number(rows[0].max) + 1);
}

/** Creates a Sales ID with its settings row and default pipeline (inside tx). */
/**
 * Checks the main / alternate sending accounts belong to this CRM account and
 * assigns them to the Sales ID so they appear under its SMTP accounts.
 */
async function applySenders(
  tx,
  accountId,
  workspaceId,
  { primarySmtpAccountId, alternateSmtpAccountId },
) {
  const ids = [primarySmtpAccountId, alternateSmtpAccountId].filter(Boolean);
  if (primarySmtpAccountId && primarySmtpAccountId === alternateSmtpAccountId) {
    throw new AppError(
      400,
      "SAME_SENDER",
      "The main and alternate email must be different accounts.",
    );
  }
  if (!ids.length) return;
  const found = await tx.smtpAccount.count({
    where: { id: { in: ids }, accountId, deletedAt: null },
  });
  if (found !== ids.length)
    throw new AppError(
      400,
      "INVALID_SMTP",
      "Choose SMTP accounts from your SMTP accounts page.",
    );
  await tx.smtpAccountWorkspace.createMany({
    data: ids.map((smtpAccountId) => ({ smtpAccountId, workspaceId })),
    skipDuplicates: true,
  });
}

export async function createWorkspaceRecords(tx, accountId, data) {
  // A custom code (e.g. REP-101) can be chosen; otherwise SID-001, SID-002, …
  let code = data.code ? data.code.toUpperCase() : null;
  if (code) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-id-code:${accountId}`}))`;
    if (await tx.salesWorkspace.count({ where: { accountId, code } })) {
      throw conflict(
        `The Sales ID code ${code} is already used (codes are never reused).`,
        "DUPLICATE_CODE",
      );
    }
  } else code = await nextCode(tx, accountId);
  const workspace = await tx.salesWorkspace.create({
    data: {
      accountId,
      code,
      name: data.name,
      description: data.description ?? null,
      color: data.color ?? null,
      isDefault: Boolean(data.isDefault),
      defaultCurrency: data.defaultCurrency ?? null,
      defaultTimezone: data.defaultTimezone ?? null,
      senderLegalName: data.senderLegalName ?? null,
      senderPostalAddress: data.senderPostalAddress ?? null,
      settings: { create: {} },
      pipelines: {
        create: {
          accountId,
          name: "Sales pipeline",
          isDefault: true,
          stages: {
            create: DEFAULT_STAGES.map((s, position) => ({ ...s, position })),
          },
        },
      },
    },
    select: { id: true },
  });
  if (data.primarySmtpAccountId || data.alternateSmtpAccountId) {
    await applySenders(tx, accountId, workspace.id, data);
    await tx.salesWorkspace.update({
      where: { id: workspace.id },
      data: {
        primarySmtpAccountId: data.primarySmtpAccountId ?? null,
        alternateSmtpAccountId: data.alternateSmtpAccountId ?? null,
      },
    });
  }
  return tx.salesWorkspace.findUnique({
    where: { id: workspace.id },
    select: PUBLIC_FIELDS,
  });
}

async function findOwned(accountId, id, db = prisma) {
  const ws = await db.salesWorkspace.findFirst({
    where: { id, accountId, deletedAt: null },
  });
  if (!ws) throw notFound("Sales ID");
  return ws;
}

// ---------------------------------------------------------------- queries

export async function listWorkspaces(
  accountId,
  { page, pageSize, sort, q, status, includeStats },
) {
  const where = {
    accountId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.salesWorkspace.findMany({
      where,
      select: PUBLIC_FIELDS,
      orderBy: [
        toOrderBy(sort, ["code", "name", "createdAt", "status"], {
          code: "asc",
        }),
      ],
      ...toSkipTake({ page, pageSize }),
    }),
    prisma.salesWorkspace.count({ where }),
  ]);
  if (includeStats) {
    const stats = await workspaceStats(
      accountId,
      items.map((i) => i.id),
    );
    for (const item of items) item.stats = stats.get(item.id);
  }
  return { items, total };
}

// Lightweight list for the header switcher (every live Sales ID, no paging).
export async function switcherOptions(accountId) {
  return prisma.salesWorkspace.findMany({
    where: { accountId, deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      isDefault: true,
      color: true,
    },
    orderBy: { code: "asc" },
  });
}

export async function getWorkspace(accountId, id) {
  const ws = await prisma.salesWorkspace.findFirst({
    where: { id, accountId, deletedAt: null },
    select: { ...PUBLIC_FIELDS, settings: true },
  });
  if (!ws) throw notFound("Sales ID");
  const stats = await workspaceStats(accountId, [id]);
  const smtpAccounts = await prisma.smtpAccountWorkspace.findMany({
    where: { workspaceId: id, smtpAccount: { deletedAt: null } },
    select: {
      assignedAt: true,
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
  });
  return {
    ...ws,
    stats: stats.get(id),
    smtpAccounts: smtpAccounts.map((s) => ({
      ...s.smtpAccount,
      assignedAt: s.assignedAt,
    })),
  };
}

// ---------------------------------------------------------------- commands

export async function createWorkspace(accountId, data, ctx) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.salesWorkspace.count({
      where: { accountId, deletedAt: null },
    });
    const makeDefault = Boolean(data.isDefault) || existing === 0;
    if (makeDefault)
      await tx.salesWorkspace.updateMany({
        where: { accountId, isDefault: true },
        data: { isDefault: false },
      });
    const ws = await createWorkspaceRecords(tx, accountId, {
      ...data,
      isDefault: makeDefault,
    });
    await writeAudit(
      {
        accountId,
        workspaceId: ws.id,
        action: "sales_id.create",
        entityType: "SalesWorkspace",
        entityId: ws.id,
        after: ws,
        ctx,
      },
      tx,
    );
    return ws;
  });
}

export async function updateWorkspace(accountId, id, data, ctx) {
  const before = await findOwned(accountId, id);
  const { settings, ...fields } = data;
  if (fields.code && fields.code !== before.code) {
    if (
      await prisma.salesWorkspace.count({
        where: { accountId, code: fields.code },
      })
    ) {
      throw conflict(
        `The Sales ID code ${fields.code} is already used (codes are never reused).`,
        "DUPLICATE_CODE",
      );
    }
  }
  return prisma.$transaction(async (tx) => {
    if (
      fields.primarySmtpAccountId !== undefined ||
      fields.alternateSmtpAccountId !== undefined
    ) {
      await applySenders(tx, accountId, id, {
        primarySmtpAccountId:
          fields.primarySmtpAccountId !== undefined
            ? fields.primarySmtpAccountId
            : before.primarySmtpAccountId,
        alternateSmtpAccountId:
          fields.alternateSmtpAccountId !== undefined
            ? fields.alternateSmtpAccountId
            : before.alternateSmtpAccountId,
      });
    }
    const ws = await tx.salesWorkspace.update({
      where: { id },
      data: fields,
      select: PUBLIC_FIELDS,
    });
    if (settings)
      await tx.salesWorkspaceSettings.update({
        where: { workspaceId: id },
        data: settings,
      });
    await writeAudit(
      {
        accountId,
        workspaceId: id,
        action: "sales_id.update",
        entityType: "SalesWorkspace",
        entityId: id,
        before,
        after: { ...ws, settings },
        ctx,
      },
      tx,
    );
    return ws;
  });
}

export async function setStatus(accountId, id, status, ctx) {
  const ws = await findOwned(accountId, id);
  if (status !== "ACTIVE" && ws.isDefault) {
    throw conflict(
      "The default Sales ID cannot be deactivated. Make another Sales ID the default first.",
      "DEFAULT_SALES_ID",
    );
  }
  if (status !== "ACTIVE") {
    const sending = await prisma.campaign.count({
      where: {
        ownerWorkspaceId: id,
        deletedAt: null,
        status: { in: ["SCHEDULED", "QUEUED", "SENDING"] },
      },
    });
    if (sending > 0) {
      throw conflict(
        `This Sales ID has ${sending} scheduled or sending campaign(s). Pause or cancel them first.`,
        "ACTIVE_CAMPAIGNS",
      );
    }
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.salesWorkspace.update({
      where: { id },
      data: { status },
      select: PUBLIC_FIELDS,
    });
    await writeAudit(
      {
        accountId,
        workspaceId: id,
        action: `sales_id.${status === "ACTIVE" ? "activate" : "deactivate"}`,
        entityType: "SalesWorkspace",
        entityId: id,
        before: { status: ws.status },
        after: { status },
        ctx,
      },
      tx,
    );
    return updated;
  });
}

export async function setDefault(accountId, id, ctx) {
  const ws = await findOwned(accountId, id);
  if (ws.status !== "ACTIVE")
    throw conflict(
      "Only an active Sales ID can be the default.",
      "SALES_ID_INACTIVE",
    );
  return prisma.$transaction(async (tx) => {
    await tx.salesWorkspace.updateMany({
      where: { accountId, isDefault: true },
      data: { isDefault: false },
    });
    const updated = await tx.salesWorkspace.update({
      where: { id },
      data: { isDefault: true },
      select: PUBLIC_FIELDS,
    });
    await writeAudit(
      {
        accountId,
        workspaceId: id,
        action: "sales_id.set_default",
        entityType: "SalesWorkspace",
        entityId: id,
        ctx,
      },
      tx,
    );
    return updated;
  });
}

const OWNED_MODELS = [
  "lead",
  "contact",
  "company",
  "deal",
  "task",
  "emailList",
  "emailTemplate",
  "campaign",
  "automation",
];

async function ownedCounts(db, accountId, id) {
  const counts = await Promise.all(
    OWNED_MODELS.map((m) =>
      db[m].count({
        where: { accountId, ownerWorkspaceId: id, deletedAt: null },
      }),
    ),
  );
  return Object.fromEntries(OWNED_MODELS.map((m, i) => [m, counts[i]]));
}

/**
 * Soft-deletes a Sales ID. If it still owns records, transferToId is required
 * and every record moves there first (with transfer history), in one transaction.
 */
export async function deleteWorkspace(
  accountId,
  id,
  { transferToId, confirmCode },
  ctx,
) {
  const ws = await findOwned(accountId, id);
  if (confirmCode !== ws.code) {
    throw new AppError(
      400,
      "CONFIRMATION_REQUIRED",
      `Type ${ws.code} to confirm deleting this Sales ID.`,
    );
  }
  if (ws.isDefault)
    throw conflict(
      "The default Sales ID cannot be deleted. Make another Sales ID the default first.",
      "DEFAULT_SALES_ID",
    );

  const active = await prisma.campaign.count({
    where: {
      ownerWorkspaceId: id,
      deletedAt: null,
      status: { in: ["SCHEDULED", "QUEUED", "SENDING", "PAUSED"] },
    },
  });
  if (active > 0)
    throw conflict(
      `Cancel or finish this Sales ID's ${active} active campaign(s) first.`,
      "ACTIVE_CAMPAIGNS",
    );

  const counts = await ownedCounts(prisma, accountId, id);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > 0 && !transferToId) {
    throw conflict(
      "This Sales ID still owns records. Choose a Sales ID to move them to.",
      "TRANSFER_TARGET_REQUIRED",
      { counts },
    );
  }

  let target = null;
  if (total > 0) {
    if (transferToId === id)
      throw new AppError(
        400,
        "INVALID_TARGET",
        "Choose a different Sales ID to move records to.",
      );
    target = await findOwned(accountId, transferToId);
    if (target.status !== "ACTIVE")
      throw conflict(
        `Sales ID ${target.code} is not active.`,
        "SALES_ID_INACTIVE",
      );
  }

  return prisma.$transaction(
    async (tx) => {
      let moved = {};
      if (target)
        moved = await moveAllRecords(tx, {
          accountId,
          from: ws,
          to: target,
          userId: ctx.userId,
        });

      // Shares pointing at the deleted Sales ID end; SMTP assignments are removed.
      await tx.recordShare.updateMany({
        where: { targetWorkspaceId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: ctx.userId },
      });
      await tx.smtpAccountWorkspace.deleteMany({ where: { workspaceId: id } });
      await tx.salesWorkspace.update({
        where: { id },
        data: { deletedAt: new Date(), status: "ARCHIVED", isDefault: false },
      });

      await writeAudit(
        {
          accountId,
          workspaceId: id,
          action: "sales_id.delete",
          entityType: "SalesWorkspace",
          entityId: id,
          before: ws,
          metadata: { transferredTo: target?.id ?? null, moved },
          ctx,
        },
        tx,
      );
      return {
        deleted: true,
        transferredTo: target ? { id: target.id, code: target.code } : null,
        moved,
      };
    },
    { timeout: 120_000 },
  );
}

async function moveAllRecords(tx, { accountId, from, to, userId }) {
  // Uniqueness inside a Sales ID: stop with a clear list instead of a raw DB error.
  const dupContacts = await tx.$queryRaw`
    SELECT c."emailNormalized" AS value FROM contacts c
    WHERE c."ownerWorkspaceId" = ${from.id}::uuid AND c."deletedAt" IS NULL AND c."emailNormalized" IS NOT NULL
      AND EXISTS (SELECT 1 FROM contacts t WHERE t."ownerWorkspaceId" = ${to.id}::uuid AND t."deletedAt" IS NULL AND t."emailNormalized" = c."emailNormalized")
    LIMIT 20`;
  const dupCompanies = await tx.$queryRaw`
    SELECT c.name AS value FROM companies c
    WHERE c."ownerWorkspaceId" = ${from.id}::uuid AND c."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM companies t WHERE t."ownerWorkspaceId" = ${to.id}::uuid AND t."deletedAt" IS NULL AND t."nameNormalized" = c."nameNormalized")
    LIMIT 20`;
  const dupLists = await tx.$queryRaw`
    SELECT l.name AS value FROM email_lists l
    WHERE l."ownerWorkspaceId" = ${from.id}::uuid AND l."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM email_lists t WHERE t."ownerWorkspaceId" = ${to.id}::uuid AND t."deletedAt" IS NULL AND t.name = l.name)
    LIMIT 20`;
  if (dupContacts.length || dupCompanies.length || dupLists.length) {
    throw conflict(
      `Sales ID ${to.code} already has some of the same records. Merge or rename them first.`,
      "TRANSFER_DUPLICATES",
      {
        contacts: dupContacts.map((r) => r.value),
        companies: dupCompanies.map((r) => r.value),
        emailLists: dupLists.map((r) => r.value),
      },
    );
  }

  // Transfer history for every shareable record.
  for (const [entityType, table] of [
    ["LEAD", "leads"],
    ["CONTACT", "contacts"],
    ["COMPANY", "companies"],
    ["DEAL", "deals"],
  ]) {
    await tx.$executeRawUnsafe(
      `INSERT INTO record_transfer_history (id, "accountId", "entityType", "entityId", "fromWorkspaceId", "toWorkspaceId", reason, "performedById", "createdAt")
       SELECT gen_random_uuid(), "accountId", $1::"ShareableEntity", id, $2::uuid, $3::uuid, $4, $5::uuid, now()
       FROM ${table} WHERE "ownerWorkspaceId" = $2::uuid AND "deletedAt" IS NULL`,
      entityType,
      from.id,
      to.id,
      `Sales ID ${from.code} deleted`,
      userId,
    );
  }

  // Shares from the old owner to the new owner become ownership; the rest follow the record.
  await tx.recordShare.deleteMany({
    where: { ownerWorkspaceId: from.id, targetWorkspaceId: to.id },
  });
  await tx.recordShare.updateMany({
    where: { ownerWorkspaceId: from.id },
    data: { ownerWorkspaceId: to.id },
  });

  // Pipelines move with their deals; rename on a name clash.
  const pipelines = await tx.pipeline.findMany({
    where: { workspaceId: from.id },
  });
  for (const p of pipelines) {
    const clash = await tx.pipeline.count({
      where: { workspaceId: to.id, name: p.name },
    });
    await tx.pipeline.update({
      where: { id: p.id },
      data: {
        workspaceId: to.id,
        isDefault: false,
        name: clash ? `${p.name} (${from.code})` : p.name,
      },
    });
  }

  const moved = {};
  for (const m of OWNED_MODELS) {
    const r = await tx[m].updateMany({
      where: { accountId, ownerWorkspaceId: from.id },
      data: { ownerWorkspaceId: to.id },
    });
    moved[m] = r.count;
  }
  return moved;
}
