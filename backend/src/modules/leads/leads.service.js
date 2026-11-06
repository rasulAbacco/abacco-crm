import prisma from "../../prisma/client.js";
import { createRecordService } from "../../services/records/recordService.js";
import { normalizeEmail, normalizeName } from "../../utils/normalize.js";
import {
  normalizePerson,
  countryTimezoneMap,
  parsePhone,
  resolveTimezone,
} from "../../utils/intl.js";
import { conflict, AppError } from "../../utils/errors.js";
import { getRecordAccess, assertCanEdit } from "../../utils/scope.js";
import { resolveWriteWorkspace } from "../../middleware/salesIdMiddleware.js";
import { writeAudit } from "../../services/audit/auditService.js";
import { toMinor } from "../../utils/money.js";
import { parseUpload, pick } from "../../services/files/tabularService.js";
import { publish } from "../../services/events/eventBus.js";
import { buildScopeWhere } from "../../utils/scope.js";
import { createWorkspaceRecords } from "../sales-ids/salesId.service.js";
import { parseCcEmails } from "../../utils/ccEmails.js";

// Simple, explainable lead score (0-100) used when the user does not set one.
export function computeScore(l) {
  let s = 0;
  if (l.email) s += 20;
  if (l.phoneE164 || l.phoneRaw) s += 10;
  if (l.companyName || l.companyId) s += 15;
  if (l.designation) s += 10;
  if (l.website) s += 10;
  s += { LOW: 0, MEDIUM: 5, HIGH: 10, URGENT: 15 }[l.priority ?? "MEDIUM"];
  s += {
    NEW: 0,
    CONTACTED: 5,
    QUALIFIED: 20,
    UNQUALIFIED: -20,
    CONVERTED: 20,
    LOST: -20,
  }[l.status ?? "NEW"];
  return Math.max(0, Math.min(100, s));
}

async function assertCompany(db, accountId, companyId) {
  if (!companyId) return;
  const c = await db.company.findFirst({
    where: { id: companyId, accountId, deletedAt: null },
    select: { id: true },
  });
  if (!c)
    throw new AppError(400, "INVALID_COMPANY", "That company does not exist.");
}

async function prepare({ input, scope, workspace, existing, db }) {
  const { allowDuplicate, basicPrice, premiumPrice, ...data } = input;
  // Package prices are typed by the user, stored exactly, never converted.
  if (
    basicPrice !== undefined ||
    premiumPrice !== undefined ||
    data.priceCurrency
  ) {
    const cur = data.priceCurrency ?? existing?.priceCurrency ?? "USD";
    data.priceCurrency = cur;
    if (basicPrice !== undefined)
      data.basicPriceMinor =
        basicPrice === null || basicPrice === ""
          ? null
          : toMinor(basicPrice, cur);
    if (premiumPrice !== undefined)
      data.premiumPriceMinor =
        premiumPrice === null || premiumPrice === ""
          ? null
          : toMinor(premiumPrice, cur);
  }
  if (data.responseStatus || data.callStatus)
    await rememberStatuses(
      scope.accountId,
      [data.responseStatus],
      [data.callStatus],
      db,
    );
  if (data.email !== undefined)
    data.emailNormalized = normalizeEmail(data.email);
  const wsId = existing?.ownerWorkspaceId ?? workspace.id;
  if (
    data.emailNormalized &&
    data.emailNormalized !== existing?.emailNormalized &&
    !allowDuplicate
  ) {
    const dup = await db.lead.findFirst({
      where: {
        ownerWorkspaceId: wsId,
        emailNormalized: data.emailNormalized,
        deletedAt: null,
      },
      select: { id: true, fullName: true },
    });
    if (dup)
      throw conflict(
        `A lead with ${data.email} already exists in this Sales ID (${dup.fullName}).`,
        "DUPLICATE_LEAD",
        { existingId: dup.id },
      );
  }
  await assertCompany(db, scope.accountId, data.companyId);
  const person = await normalizePerson(db, scope.accountId, data, existing);
  const merged = { ...existing, ...person };
  if (
    !existing ||
    ["firstName", "lastName", "fullName", "email"].some((k) => k in data)
  ) {
    person.fullName =
      data.fullName ||
      [merged.firstName, merged.lastName].filter(Boolean).join(" ") ||
      merged.fullName ||
      merged.email ||
      merged.companyName ||
      "Unnamed lead";
  }
  if (person.score === undefined || person.score === null)
    person.score = computeScore(merged);
  if (person.status === "CONVERTED" && !existing?.convertedAt)
    person.convertedAt = new Date();
  return person;
}

export const leadService = createRecordService({
  entityType: "LEAD",
  searchFields: ["fullName", "email", "companyName", "phoneRaw", "city"],
  sortable: [
    "createdAt",
    "updatedAt",
    "fullName",
    "score",
    "status",
    "priority",
    "companyName",
  ],
  listInclude: { company: { select: { id: true, name: true } } },
  detailInclude: {
    company: { select: { id: true, name: true, website: true } },
    contact: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    deals: {
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        amountMinor: true,
        currency: true,
        status: true,
        stage: { select: { name: true } },
      },
    },
    tasks: {
      where: { deletedAt: null },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        priority: true,
      },
    },
  },
  prepare,
  titleOf: (r) => r.fullName,
  onUpdated: async (tx, before, after, ctx, scope) => {
    if (before.status !== after.status) {
      await tx.activity.create({
        data: {
          accountId: after.accountId,
          workspaceId: scope.workspaceId ?? after.ownerWorkspaceId,
          actorId: ctx.userId,
          leadId: after.id,
          type: "STATUS_CHANGE",
          subject: `Status ${before.status} → ${after.status}`,
        },
      });
    }
  },
});

export function leadFilters(q) {
  return {
    ...(q.status ? { status: q.status } : {}),
    ...(q.priority ? { priority: q.priority } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.countryCode ? { countryCode: q.countryCode } : {}),
    ...(q.responseStatus
      ? {
          responseStatus:
            q.responseStatus === "(none)" ? null : q.responseStatus,
        }
      : {}),
    ...(q.callStatus
      ? { callStatus: q.callStatus === "(none)" ? null : q.callStatus }
      : {}),
  };
}

// ---------------------------------------------------------------- editable status lists

const OPTIONS_KEY = "leads.followUpOptions";
export const DEFAULT_OPTIONS = {
  responseStatuses: [
    "Active",
    "Not Responding",
    "Responded",
    "Interested",
    "Budget",
    "Leave Out",
    "Not Interested",
    "Converted",
  ],
  callStatuses: [
    "Not Called",
    "Left Voicemail",
    "Call Connected",
    "Call Back Later",
    "No Answer",
    "Wrong Number",
  ],
};

export async function getOptions(accountId, db = prisma) {
  const row = await db.systemSetting.findUnique({
    where: { accountId_key: { accountId, key: OPTIONS_KEY } },
  });
  return { ...DEFAULT_OPTIONS, ...(row?.value ?? {}) };
}

export async function setOptions(accountId, patch, ctx) {
  const value = { ...(await getOptions(accountId)), ...patch };
  await prisma.systemSetting.upsert({
    where: { accountId_key: { accountId, key: OPTIONS_KEY } },
    create: { accountId, key: OPTIONS_KEY, value },
    update: { value },
  });
  await writeAudit({
    accountId,
    action: "lead.options_update",
    entityType: "SystemSetting",
    entityId: OPTIONS_KEY,
    after: value,
    ctx,
  });
  return value;
}

/** Values typed in a form or found in an import are added to the lists automatically. */
async function rememberStatuses(accountId, responses, calls, db = prisma) {
  const cur = await getOptions(accountId, db);
  const addR = [...new Set(responses.filter(Boolean))].filter(
    (v) =>
      !cur.responseStatuses.some((x) => x.toLowerCase() === v.toLowerCase()),
  );
  const addC = [...new Set(calls.filter(Boolean))].filter(
    (v) => !cur.callStatuses.some((x) => x.toLowerCase() === v.toLowerCase()),
  );
  if (!addR.length && !addC.length) return;
  const value = {
    responseStatuses: [...cur.responseStatuses, ...addR],
    callStatuses: [...cur.callStatuses, ...addC],
  };
  await db.systemSetting.upsert({
    where: { accountId_key: { accountId, key: OPTIONS_KEY } },
    create: { accountId, key: OPTIONS_KEY, value },
    update: { value },
  });
}

/** Uses the list's spelling when the value matches ignoring case ("not responding" → "Not Responding"). */
function canonical(value, list) {
  if (!value) return null;
  return (
    list.find((x) => x.toLowerCase() === value.trim().toLowerCase()) ??
    value.trim()
  );
}

// ---------------------------------------------------------------- email audience

/**
 * Turns selected leads into an email list (creating contacts for them in the
 * same Sales ID) so one campaign can be sent to all of them.
 */
export async function buildEmailAudience(scope, ids, listName, ctx) {
  const where = await buildScopeWhere(scope, "LEAD");
  const leads = await prisma.lead.findMany({
    where: { AND: [where, { id: { in: ids } }] },
    include: {
      ownerWorkspace: {
        select: { id: true, code: true, name: true, status: true },
      },
    },
  });
  if (!leads.length)
    throw new AppError(
      400,
      "NO_LEADS",
      "None of the selected leads are available.",
    );
  const withEmail = leads.filter((l) => l.emailNormalized);
  if (!withEmail.length)
    throw new AppError(
      400,
      "NO_EMAILS",
      "None of the selected leads has an email address.",
    );
  const workspaces = [
    ...new Map(
      withEmail.map((l) => [l.ownerWorkspaceId, l.ownerWorkspace]),
    ).values(),
  ];
  if (workspaces.length > 1) {
    throw conflict(
      `The selected leads belong to ${workspaces.map((w) => w.code).join(", ")}. A campaign is sent from one Sales ID — select one Sales ID at the top and try again.`,
      "MULTIPLE_SALES_IDS",
      { salesIds: workspaces.map((w) => w.code) },
    );
  }
  const ws = workspaces[0];
  if (ws.status !== "ACTIVE")
    throw conflict(`Sales ID ${ws.code} is not active.`, "SALES_ID_INACTIVE");

  let name = listName ?? `Leads ${new Date().toISOString().slice(0, 10)}`;
  for (
    let n = 2;
    await prisma.emailList.count({
      where: { ownerWorkspaceId: ws.id, name, deletedAt: null },
    });
    n++
  )
    name = `${listName ?? "Leads"} (${n})`;

  const result = await prisma.$transaction(
    async (tx) => {
      const list = await tx.emailList.create({
        data: {
          accountId: scope.accountId,
          ownerWorkspaceId: ws.id,
          name,
          description: `Created from ${withEmail.length} selected leads`,
        },
      });
      let contactsCreated = 0;
      const contactIds = [];
      for (const l of withEmail) {
        let c = await tx.contact.findFirst({
          where: {
            ownerWorkspaceId: ws.id,
            emailNormalized: l.emailNormalized,
            deletedAt: null,
          },
          select: { id: true },
        });
        // The lead's CC and subject line follow it onto the contact the campaign sends to.
        if (c && (l.ccEmails?.length || l.subjectLine)) {
          await tx.contact.update({
            where: { id: c.id },
            data: {
              ...(l.ccEmails?.length ? { ccEmails: l.ccEmails } : {}),
              ...(l.subjectLine ? { subjectLine: l.subjectLine } : {}),
            },
          });
        }
        if (!c) {
          c = await tx.contact.create({
            data: {
              accountId: scope.accountId,
              ownerWorkspaceId: ws.id,
              firstName: l.firstName ?? l.fullName,
              lastName: l.lastName,
              email: l.email,
              emailNormalized: l.emailNormalized,
              phoneRaw: l.phoneRaw,
              phoneE164: l.phoneE164,
              designation: l.designation,
              countryCode: l.countryCode,
              region: l.region,
              city: l.city,
              timezone: l.timezone,
              timezoneSource: l.timezoneSource,
              locale: l.locale,
              source: "Lead",
              ccEmails: l.ccEmails ?? [],
              subjectLine: l.subjectLine ?? null,
            },
            select: { id: true },
          });
          contactsCreated++;
        }
        contactIds.push(c.id);
      }
      await tx.emailListContact.createMany({
        data: [...new Set(contactIds)].map((contactId) => ({
          listId: list.id,
          contactId,
          source: "leads",
        })),
        skipDuplicates: true,
      });
      await writeAudit(
        {
          accountId: scope.accountId,
          workspaceId: ws.id,
          action: "lead.email_audience",
          entityType: "EmailList",
          entityId: list.id,
          metadata: { leads: withEmail.length, contactsCreated },
          ctx,
        },
        tx,
      );
      return { listId: list.id, listName: name, contactsCreated };
    },
    { timeout: 120_000 },
  );
  return {
    ...result,
    workspace: { id: ws.id, code: ws.code, name: ws.name },
    added: withEmail.length,
    skippedNoEmail: leads.length - withEmail.length,
  };
}

/** Lead → contact (+ optional company and deal) in one transaction. */
export async function convertLead(scope, id, input, ctx) {
  const { record: lead, access } = await getRecordAccess(scope, "LEAD", id);
  assertCanEdit(access, "lead");
  if (lead.status === "CONVERTED" && lead.contactId)
    throw conflict("This lead is already converted.", "ALREADY_CONVERTED");
  const ws = lead.ownerWorkspaceId;
  const result = await prisma.$transaction(async (tx) => {
    let companyId = lead.companyId;
    if (!companyId && lead.companyName && input.createCompany) {
      const nameNormalized = normalizeName(lead.companyName);
      const existing = await tx.company.findFirst({
        where: { ownerWorkspaceId: ws, nameNormalized, deletedAt: null },
      });
      companyId =
        existing?.id ??
        (
          await tx.company.create({
            data: {
              accountId: lead.accountId,
              ownerWorkspaceId: ws,
              name: lead.companyName,
              nameNormalized,
              website: lead.website,
              countryCode: lead.countryCode,
            },
          })
        ).id;
    }
    let contact = lead.emailNormalized
      ? await tx.contact.findFirst({
          where: {
            ownerWorkspaceId: ws,
            emailNormalized: lead.emailNormalized,
            deletedAt: null,
          },
        })
      : null;
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          accountId: lead.accountId,
          ownerWorkspaceId: ws,
          companyId,
          firstName: lead.firstName ?? lead.fullName,
          lastName: lead.lastName,
          email: lead.email,
          emailNormalized: lead.emailNormalized,
          phoneE164: lead.phoneE164,
          phoneRaw: lead.phoneRaw,
          designation: lead.designation,
          countryCode: lead.countryCode,
          region: lead.region,
          city: lead.city,
          timezone: lead.timezone,
          timezoneSource: lead.timezoneSource,
          locale: lead.locale,
          source: lead.source,
        },
      });
    }
    let deal = null;
    if (input.deal) {
      const pipeline = await tx.pipeline.findFirst({
        where: { workspaceId: ws },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: { stages: { orderBy: { position: "asc" } } },
      });
      const stage = pipeline.stages.find((s) => s.kind === "OPEN");
      const account = await tx.account.findUnique({
        where: { id: lead.accountId },
        select: { defaultCurrency: true },
      });
      const currency = input.deal.currency ?? account.defaultCurrency;
      deal = await tx.deal.create({
        data: {
          accountId: lead.accountId,
          ownerWorkspaceId: ws,
          pipelineId: pipeline.id,
          stageId: stage.id,
          leadId: id,
          contactId: contact.id,
          companyId,
          title: input.deal.title,
          currency,
          amountMinor: toMinor(input.deal.amount ?? "0", currency),
          expectedCloseDate: input.deal.expectedCloseDate,
        },
      });
    }
    await tx.lead.update({
      where: { id },
      data: {
        status: "CONVERTED",
        convertedAt: new Date(),
        contactId: contact.id,
        companyId,
      },
    });
    await tx.activity.create({
      data: {
        accountId: lead.accountId,
        workspaceId: ws,
        actorId: ctx.userId,
        leadId: id,
        type: "STATUS_CHANGE",
        subject: "Converted to contact",
        metadata: { contactId: contact.id, dealId: deal?.id ?? null },
      },
    });
    await writeAudit(
      {
        accountId: lead.accountId,
        workspaceId: ws,
        action: "lead.convert",
        entityType: "LEAD",
        entityId: id,
        after: { contactId: contact.id, companyId, dealId: deal?.id ?? null },
        ctx,
      },
      tx,
    );
    return { contactId: contact.id, companyId, dealId: deal?.id ?? null };
  });
  return result;
}

const SALES_ID_RE = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
const intOrNull = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

/**
 * CSV/XLSX import. Accepts the team's tracker layout (Sales ID, Client Name,
 * Client Email, Phone Number, Response Status, Call Status, Call Notes,
 * Previous Pitch, Follow Up Pitch, Basic/Premium Package Price, Data Count)
 * as well as the general lead columns. Each row goes to the Sales ID named in
 * its "Sales ID" column (code or name); rows without one go to the selected
 * Sales ID. Duplicates (same email in the same Sales ID) are skipped or updated.
 */
export async function importLeads(scope, file, opts, ctx) {
  const rows = await parseUpload(file);
  const all = await prisma.salesWorkspace.findMany({
    where: { accountId: scope.accountId, deletedAt: null },
  });
  const byKey = new Map();
  for (const w of all) {
    byKey.set(w.code.toLowerCase(), w);
    byKey.set(w.name.toLowerCase(), w);
  }
  const defaultWs = await resolveWriteWorkspace(
    scope,
    opts.ownerWorkspaceId,
  ).catch(() => null);
  const jobWs = defaultWs ?? all.find((w) => w.isDefault) ?? all[0];
  const job = await prisma.importJob.create({
    data: {
      accountId: scope.accountId,
      workspaceId: jobWs.id,
      createdById: ctx.userId,
      entityType: "LEAD",
      fileName: file.originalname,
      status: "PROCESSING",
      totalRows: rows.length,
      options: opts,
    },
  });
  const tzMap = await countryTimezoneMap(prisma, scope.accountId);
  const options = await getOptions(scope.accountId);
  const seen = new Set();
  const errors = [];
  const perSalesId = {};
  const newResponse = [];
  const newCall = [];
  const createdSalesIds = [];
  const missingSalesIds = new Set();
  let createdCount = 0,
    updatedCount = 0,
    skippedCount = 0;
  const batch = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    // ---- Sales ID routing
    const sid = pick(
      r,
      "salesid",
      "salesidcode",
      "salesidname",
      "rep",
      "repid",
    );
    let ws = sid ? byKey.get(sid.toLowerCase()) : defaultWs;
    if (!ws && sid) {
      const code = sid.toUpperCase();
      if (opts.createMissingSalesIds && SALES_ID_RE.test(code)) {
        ws = await prisma.$transaction((tx) =>
          createWorkspaceRecords(tx, scope.accountId, { code, name: code }),
        );
        ws.status = "ACTIVE";
        byKey.set(code.toLowerCase(), ws);
        createdSalesIds.push(code);
      } else {
        missingSalesIds.add(sid);
        errors.push({
          line,
          message: `Unknown Sales ID "${sid}". Create it first, or tick "Create Sales IDs that do not exist yet".`,
        });
        continue;
      }
    }
    if (!ws) {
      errors.push({
        line,
        message:
          'No Sales ID in this row. Choose a Sales ID for the import or add a "Sales ID" column.',
      });
      continue;
    }
    if (ws.status !== "ACTIVE") {
      errors.push({ line, message: `Sales ID ${ws.code} is not active.` });
      continue;
    }

    // ---- person
    const email = pick(r, "clientemail", "email", "emailaddress", "e-mail");
    const first = pick(r, "firstname", "first");
    const last = pick(r, "lastname", "last", "surname");
    const clientName = pick(r, "clientname", "name", "fullname", "leadname");
    const companyName =
      pick(r, "company", "companyname", "organisation", "organization") ??
      clientName;
    const full =
      clientName ?? ([first, last].filter(Boolean).join(" ") || undefined);
    if (!full && !email && !companyName) {
      errors.push({
        line,
        message: "Row has no client name, email or company.",
      });
      continue;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ line, message: `Invalid email "${email}".` });
      continue;
    }
    const emailNormalized = normalizeEmail(email);
    const cc = parseCcEmails(
      pick(r, "ccmail", "ccemail", "cc", "ccemails", "ccmails", "ccaddress"),
    );
    if (cc.invalid.length) {
      errors.push({
        line,
        message: `Invalid CC Mail "${cc.invalid.join(", ")}".`,
      });
      continue;
    }
    if (emailNormalized) {
      const key = `${ws.id}:${emailNormalized}`;
      if (seen.has(key)) {
        skippedCount++;
        continue;
      }
      seen.add(key);
    }
    let countryCode = pick(r, "country", "countrycode")?.toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) countryCode = undefined;
    const phone = parsePhone(
      pick(r, "phonenumber", "phone", "mobile", "contactnumber"),
      countryCode,
    );
    countryCode = countryCode ?? phone.phoneCountry ?? null;
    const tz = resolveTimezone(
      {
        timezone: pick(r, "timezone"),
        countryCode,
        phoneCountry: phone.phoneCountry,
      },
      tzMap,
    );

    // ---- follow-up fields
    const responseStatus = canonical(
      pick(r, "responsestatus", "clientstatus", "followupstatus"),
      options.responseStatuses,
    );
    const callStatus = canonical(pick(r, "callstatus"), options.callStatuses);
    let basicPriceMinor = null;
    let premiumPriceMinor = null;
    try {
      const b = pick(r, "basicpackageprice", "basicprice", "basicpackage");
      const p = pick(
        r,
        "premiumpackageprice",
        "premiumprice",
        "premiumpackage",
      );
      if (b)
        basicPriceMinor = toMinor(
          b.replace(/[^\d.,]/g, ""),
          opts.priceCurrency,
        );
      if (p)
        premiumPriceMinor = toMinor(
          p.replace(/[^\d.,]/g, ""),
          opts.priceCurrency,
        );
    } catch (err) {
      errors.push({ line, message: `Price: ${err.message}` });
      continue;
    }
    const dataCount = intOrNull(
      pick(r, "datacountrows", "datacount", "rows", "recordcount"),
    );
    if (Number.isNaN(dataCount)) {
      errors.push({ line, message: "Data Count must be a whole number." });
      continue;
    }
    if (
      responseStatus &&
      !options.responseStatuses.includes(responseStatus) &&
      !newResponse.includes(responseStatus)
    )
      newResponse.push(responseStatus);
    if (
      callStatus &&
      !options.callStatuses.includes(callStatus) &&
      !newCall.includes(callStatus)
    )
      newCall.push(callStatus);

    const status = pick(r, "status", "leadstatus")?.toUpperCase();
    const priority = pick(r, "priority")?.toUpperCase();
    const data = {
      accountId: scope.accountId,
      ownerWorkspaceId: ws.id,
      firstName: first ?? null,
      lastName: last ?? null,
      fullName: full || email || companyName,
      email: email ?? null,
      emailNormalized,
      phoneRaw: phone.phoneRaw,
      phoneE164: phone.phoneE164,
      companyName: companyName ?? null,
      designation: pick(r, "designation", "title", "jobtitle") ?? null,
      website: pick(r, "website", "url") ?? null,
      countryCode,
      region: pick(r, "state", "region") ?? null,
      city: pick(r, "city") ?? null,
      timezone: tz.timezone,
      timezoneSource: tz.timezoneSource,
      source: pick(r, "source", "leadsource") ?? opts.source ?? "Import",
      description: pick(r, "notes", "description") ?? null,
      status: [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "UNQUALIFIED",
        "CONVERTED",
        "LOST",
      ].includes(status)
        ? status
        : "NEW",
      priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority)
        ? priority
        : "MEDIUM",
      responseStatus,
      callStatus,
      callNotes: pick(r, "callnotes", "notes") ?? null,
      previousPitch: pick(r, "previouspitch") ?? null,
      followUpPitch: pick(r, "followuppitch", "pitch") ?? null,
      priceCurrency:
        basicPriceMinor !== null || premiumPriceMinor !== null
          ? opts.priceCurrency
          : null,
      basicPriceMinor,
      premiumPriceMinor,
      dataCount,
      ccEmails: cc.emails.filter((e) => e !== emailNormalized),
      subjectLine:
        pick(
          r,
          "subjectline",
          "subject",
          "emailsubject",
          "emailsubjectline",
        )?.slice(0, 300) ?? null,
    };
    data.score = computeScore(data);
    perSalesId[ws.code] ??= { created: 0, updated: 0, skipped: 0 };
    if (emailNormalized) {
      const existing = await prisma.lead.findFirst({
        where: { ownerWorkspaceId: ws.id, emailNormalized, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        if (opts.updateExisting) {
          const {
            accountId,
            ownerWorkspaceId,
            status: _s,
            priority: _p,
            score: _sc,
            source: _src,
            ...patch
          } = data;
          await prisma.lead.update({
            where: { id: existing.id },
            data: Object.fromEntries(
              Object.entries(patch).filter(
                ([, v]) =>
                  v !== null &&
                  v !== undefined &&
                  !(Array.isArray(v) && v.length === 0),
              ),
            ),
          });
          updatedCount++;
          perSalesId[ws.code].updated++;
        } else {
          skippedCount++;
          perSalesId[ws.code].skipped++;
        }
        continue;
      }
    }
    batch.push(data);
    perSalesId[ws.code].created++;
    if (batch.length >= 500)
      createdCount += (await prisma.lead.createMany({ data: batch.splice(0) }))
        .count;
  }
  if (batch.length)
    createdCount += (await prisma.lead.createMany({ data: batch })).count;
  if (newResponse.length || newCall.length)
    await rememberStatuses(scope.accountId, newResponse, newCall);

  const done = await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: errors.length ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      processedRows: rows.length,
      createdCount,
      updatedCount,
      skippedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 500),
      completedAt: new Date(),
    },
  });
  await writeAudit({
    accountId: scope.accountId,
    workspaceId: jobWs.id,
    action: "lead.import",
    entityType: "ImportJob",
    entityId: job.id,
    metadata: {
      createdCount,
      updatedCount,
      skippedCount,
      errorCount: errors.length,
      perSalesId,
      createdSalesIds,
    },
    ctx,
  });
  if (createdCount)
    publish("lead.imported", {
      accountId: scope.accountId,
      workspaceId: jobWs.id,
      count: createdCount,
    });
  return {
    ...done,
    perSalesId,
    createdSalesIds,
    missingSalesIds: [...missingSalesIds],
    newStatuses: { response: newResponse, call: newCall },
  };
}
