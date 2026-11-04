import prisma from '../../prisma/client.js';
import { createRecordService } from '../../services/records/recordService.js';
import { normalizeEmail, normalizeName } from '../../utils/normalize.js';
import { normalizePerson, countryTimezoneMap, parsePhone, resolveTimezone } from '../../utils/intl.js';
import { conflict, AppError } from '../../utils/errors.js';
import { getRecordAccess, assertCanEdit } from '../../utils/scope.js';
import { resolveWriteWorkspace } from '../../middleware/salesIdMiddleware.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { toMinor } from '../../utils/money.js';
import { parseUpload, pick } from '../../services/files/tabularService.js';
import { publish } from '../../services/events/eventBus.js';

// Simple, explainable lead score (0-100) used when the user does not set one.
export function computeScore(l) {
  let s = 0;
  if (l.email) s += 20;
  if (l.phoneE164 || l.phoneRaw) s += 10;
  if (l.companyName || l.companyId) s += 15;
  if (l.designation) s += 10;
  if (l.website) s += 10;
  s += { LOW: 0, MEDIUM: 5, HIGH: 10, URGENT: 15 }[l.priority ?? 'MEDIUM'];
  s += { NEW: 0, CONTACTED: 5, QUALIFIED: 20, UNQUALIFIED: -20, CONVERTED: 20, LOST: -20 }[l.status ?? 'NEW'];
  return Math.max(0, Math.min(100, s));
}

async function assertCompany(db, accountId, companyId) {
  if (!companyId) return;
  const c = await db.company.findFirst({ where: { id: companyId, accountId, deletedAt: null }, select: { id: true } });
  if (!c) throw new AppError(400, 'INVALID_COMPANY', 'That company does not exist.');
}

async function prepare({ input, scope, workspace, existing, db }) {
  const { allowDuplicate, ...data } = input;
  if (data.email !== undefined) data.emailNormalized = normalizeEmail(data.email);
  const wsId = existing?.ownerWorkspaceId ?? workspace.id;
  if (data.emailNormalized && data.emailNormalized !== existing?.emailNormalized && !allowDuplicate) {
    const dup = await db.lead.findFirst({ where: { ownerWorkspaceId: wsId, emailNormalized: data.emailNormalized, deletedAt: null }, select: { id: true, fullName: true } });
    if (dup) throw conflict(`A lead with ${data.email} already exists in this Sales ID (${dup.fullName}).`, 'DUPLICATE_LEAD', { existingId: dup.id });
  }
  await assertCompany(db, scope.accountId, data.companyId);
  const person = await normalizePerson(db, scope.accountId, data, existing);
  const merged = { ...existing, ...person };
  if (!existing || ['firstName', 'lastName', 'fullName', 'email'].some((k) => k in data)) {
    person.fullName = data.fullName || [merged.firstName, merged.lastName].filter(Boolean).join(' ') || merged.fullName || merged.email || merged.companyName || 'Unnamed lead';
  }
  if (person.score === undefined || person.score === null) person.score = computeScore(merged);
  if (person.status === 'CONVERTED' && !existing?.convertedAt) person.convertedAt = new Date();
  return person;
}

export const leadService = createRecordService({
  entityType: 'LEAD',
  searchFields: ['fullName', 'email', 'companyName', 'phoneRaw', 'city'],
  sortable: ['createdAt', 'updatedAt', 'fullName', 'score', 'status', 'priority', 'companyName'],
  listInclude: { company: { select: { id: true, name: true } } },
  detailInclude: {
    company: { select: { id: true, name: true, website: true } },
    contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    deals: { where: { deletedAt: null }, select: { id: true, title: true, amountMinor: true, currency: true, status: true, stage: { select: { name: true } } } },
    tasks: { where: { deletedAt: null }, orderBy: { dueAt: 'asc' }, select: { id: true, title: true, status: true, dueAt: true, priority: true } },
  },
  prepare,
  titleOf: (r) => r.fullName,
  onUpdated: async (tx, before, after, ctx, scope) => {
    if (before.status !== after.status) {
      await tx.activity.create({ data: { accountId: after.accountId, workspaceId: scope.workspaceId ?? after.ownerWorkspaceId, actorId: ctx.userId, leadId: after.id, type: 'STATUS_CHANGE', subject: `Status ${before.status} → ${after.status}` } });
    }
  },
});

export function leadFilters(q) {
  return {
    ...(q.status ? { status: q.status } : {}),
    ...(q.priority ? { priority: q.priority } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.countryCode ? { countryCode: q.countryCode } : {}),
  };
}

/** Lead → contact (+ optional company and deal) in one transaction. */
export async function convertLead(scope, id, input, ctx) {
  const { record: lead, access } = await getRecordAccess(scope, 'LEAD', id);
  assertCanEdit(access, 'lead');
  if (lead.status === 'CONVERTED' && lead.contactId) throw conflict('This lead is already converted.', 'ALREADY_CONVERTED');
  const ws = lead.ownerWorkspaceId;
  const result = await prisma.$transaction(async (tx) => {
    let companyId = lead.companyId;
    if (!companyId && lead.companyName && input.createCompany) {
      const nameNormalized = normalizeName(lead.companyName);
      const existing = await tx.company.findFirst({ where: { ownerWorkspaceId: ws, nameNormalized, deletedAt: null } });
      companyId = existing?.id ?? (await tx.company.create({ data: { accountId: lead.accountId, ownerWorkspaceId: ws, name: lead.companyName, nameNormalized, website: lead.website, countryCode: lead.countryCode } })).id;
    }
    let contact = lead.emailNormalized ? await tx.contact.findFirst({ where: { ownerWorkspaceId: ws, emailNormalized: lead.emailNormalized, deletedAt: null } }) : null;
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          accountId: lead.accountId, ownerWorkspaceId: ws, companyId, firstName: lead.firstName ?? lead.fullName, lastName: lead.lastName,
          email: lead.email, emailNormalized: lead.emailNormalized, phoneE164: lead.phoneE164, phoneRaw: lead.phoneRaw, designation: lead.designation,
          countryCode: lead.countryCode, region: lead.region, city: lead.city, timezone: lead.timezone, timezoneSource: lead.timezoneSource, locale: lead.locale, source: lead.source,
        },
      });
    }
    let deal = null;
    if (input.deal) {
      const pipeline = await tx.pipeline.findFirst({ where: { workspaceId: ws }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { stages: { orderBy: { position: 'asc' } } } });
      const stage = pipeline.stages.find((s) => s.kind === 'OPEN');
      const account = await tx.account.findUnique({ where: { id: lead.accountId }, select: { defaultCurrency: true } });
      const currency = input.deal.currency ?? account.defaultCurrency;
      deal = await tx.deal.create({
        data: { accountId: lead.accountId, ownerWorkspaceId: ws, pipelineId: pipeline.id, stageId: stage.id, leadId: id, contactId: contact.id, companyId, title: input.deal.title, currency, amountMinor: toMinor(input.deal.amount ?? '0', currency), expectedCloseDate: input.deal.expectedCloseDate },
      });
    }
    await tx.lead.update({ where: { id }, data: { status: 'CONVERTED', convertedAt: new Date(), contactId: contact.id, companyId } });
    await tx.activity.create({ data: { accountId: lead.accountId, workspaceId: ws, actorId: ctx.userId, leadId: id, type: 'STATUS_CHANGE', subject: 'Converted to contact', metadata: { contactId: contact.id, dealId: deal?.id ?? null } } });
    await writeAudit({ accountId: lead.accountId, workspaceId: ws, action: 'lead.convert', entityType: 'LEAD', entityId: id, after: { contactId: contact.id, companyId, dealId: deal?.id ?? null }, ctx }, tx);
    return { contactId: contact.id, companyId, dealId: deal?.id ?? null };
  });
  return result;
}

/** CSV/XLSX import. Duplicates (same email in the Sales ID, or repeated in the file) are skipped or updated. */
export async function importLeads(scope, file, opts, ctx) {
  const ws = await resolveWriteWorkspace(scope, opts.ownerWorkspaceId);
  const rows = await parseUpload(file);
  const job = await prisma.importJob.create({ data: { accountId: scope.accountId, workspaceId: ws.id, createdById: ctx.userId, entityType: 'LEAD', fileName: file.originalname, status: 'PROCESSING', totalRows: rows.length } });
  const tzMap = await countryTimezoneMap(prisma, scope.accountId);
  const seen = new Set();
  const errors = [];
  let createdCount = 0, updatedCount = 0, skippedCount = 0;
  const batch = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    const email = pick(r, 'email', 'emailaddress', 'e-mail');
    const first = pick(r, 'firstname', 'first');
    const last = pick(r, 'lastname', 'last', 'surname');
    const full = pick(r, 'name', 'fullname', 'leadname') ?? [first, last].filter(Boolean).join(' ');
    const companyName = pick(r, 'company', 'companyname', 'organisation', 'organization');
    if (!full && !email && !companyName) { errors.push({ line, message: 'Row has no name, email or company.' }); continue; }
    const emailNormalized = normalizeEmail(email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ line, message: `Invalid email "${email}".` }); continue; }
    if (emailNormalized && seen.has(emailNormalized)) { skippedCount++; continue; }
    if (emailNormalized) seen.add(emailNormalized);
    let countryCode = pick(r, 'country', 'countrycode')?.toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) countryCode = undefined;
    const phone = parsePhone(pick(r, 'phone', 'mobile', 'phonenumber'), countryCode);
    countryCode = countryCode ?? phone.phoneCountry ?? null;
    const tz = resolveTimezone({ timezone: pick(r, 'timezone'), countryCode, phoneCountry: phone.phoneCountry }, tzMap);
    const status = pick(r, 'status')?.toUpperCase();
    const priority = pick(r, 'priority')?.toUpperCase();
    const data = {
      accountId: scope.accountId, ownerWorkspaceId: ws.id, firstName: first ?? null, lastName: last ?? null, fullName: full || email || companyName,
      email: email ?? null, emailNormalized, phoneRaw: phone.phoneRaw, phoneE164: phone.phoneE164, companyName: companyName ?? null,
      designation: pick(r, 'designation', 'title', 'jobtitle') ?? null, website: pick(r, 'website', 'url') ?? null, countryCode,
      region: pick(r, 'state', 'region') ?? null, city: pick(r, 'city') ?? null, timezone: tz.timezone, timezoneSource: tz.timezoneSource,
      source: pick(r, 'source', 'leadsource') ?? opts.source ?? 'Import', description: pick(r, 'notes', 'description') ?? null,
      status: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'].includes(status) ? status : 'NEW',
      priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : 'MEDIUM',
    };
    data.score = computeScore(data);
    if (emailNormalized) {
      const existing = await prisma.lead.findFirst({ where: { ownerWorkspaceId: ws.id, emailNormalized, deletedAt: null }, select: { id: true } });
      if (existing) {
        if (opts.updateExisting) {
          const { accountId, ownerWorkspaceId, ...patch } = data;
          await prisma.lead.update({ where: { id: existing.id }, data: Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined)) });
          updatedCount++;
        } else skippedCount++;
        continue;
      }
    }
    batch.push(data);
    if (batch.length >= 500) { createdCount += (await prisma.lead.createMany({ data: batch.splice(0) })).count; }
  }
  if (batch.length) createdCount += (await prisma.lead.createMany({ data: batch })).count;

  const done = await prisma.importJob.update({
    where: { id: job.id },
    data: { status: errors.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', processedRows: rows.length, createdCount, updatedCount, skippedCount, errorCount: errors.length, errors: errors.slice(0, 500), completedAt: new Date() },
  });
  await writeAudit({ accountId: scope.accountId, workspaceId: ws.id, action: 'lead.import', entityType: 'ImportJob', entityId: job.id, metadata: { createdCount, updatedCount, skippedCount, errorCount: errors.length }, ctx });
  if (createdCount) publish('lead.imported', { accountId: scope.accountId, workspaceId: ws.id, count: createdCount });
  return done;
}
