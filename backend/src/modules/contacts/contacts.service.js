import prisma from '../../prisma/client.js';
import { createRecordService } from '../../services/records/recordService.js';
import { normalizeEmail, hashEmail } from '../../utils/normalize.js';
import { normalizePerson, countryTimezoneMap, parsePhone, resolveTimezone } from '../../utils/intl.js';
import { conflict, AppError, notFound } from '../../utils/errors.js';
import { getRecordAccess, assertCanEdit, assertCanManage } from '../../utils/scope.js';
import { resolveWriteWorkspace } from '../../middleware/salesIdMiddleware.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { parseUpload, pick } from '../../services/files/tabularService.js';
import { publish } from '../../services/events/eventBus.js';

async function prepare({ input, scope, workspace, existing, db }) {
  const { consent, ...data } = input;
  if (data.email !== undefined) data.emailNormalized = normalizeEmail(data.email);
  const wsId = existing?.ownerWorkspaceId ?? workspace.id;
  if (data.emailNormalized && data.emailNormalized !== existing?.emailNormalized) {
    const dup = await db.contact.findFirst({ where: { ownerWorkspaceId: wsId, emailNormalized: data.emailNormalized, deletedAt: null }, select: { id: true } });
    if (dup) throw conflict(`A contact with ${data.email} already exists in this Sales ID.`, 'DUPLICATE_CONTACT', { existingId: dup.id });
  }
  if (data.companyId) {
    const c = await db.company.findFirst({ where: { id: data.companyId, accountId: scope.accountId, deletedAt: null }, select: { id: true } });
    if (!c) throw new AppError(400, 'INVALID_COMPANY', 'That company does not exist.');
  }
  return normalizePerson(db, scope.accountId, data, existing);
}

export const contactService = createRecordService({
  entityType: 'CONTACT',
  searchFields: ['firstName', 'lastName', 'email', 'phoneRaw', 'city', 'designation'],
  sortable: ['createdAt', 'updatedAt', 'firstName', 'lastName', 'email', 'lastContactedAt'],
  listInclude: { company: { select: { id: true, name: true } } },
  detailInclude: {
    company: { select: { id: true, name: true, website: true } },
    deals: { where: { deletedAt: null }, select: { id: true, title: true, amountMinor: true, currency: true, status: true, stage: { select: { name: true } } } },
    tasks: { where: { deletedAt: null }, orderBy: { dueAt: 'asc' }, select: { id: true, title: true, status: true, dueAt: true, priority: true } },
    listMemberships: { select: { status: true, addedAt: true, list: { select: { id: true, name: true } } } },
    consents: { orderBy: { capturedAt: 'desc' }, take: 10 },
    campaignRecips: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, status: true, sentAt: true, firstOpenedAt: true, firstClickedAt: true, campaign: { select: { id: true, name: true, subject: true } } } },
  },
  prepare,
  titleOf: (r) => [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
  onCreated: async (tx, contact, ctx) => {
    // consent captured on the create form
    const consent = ctx.pendingConsent;
    if (consent && contact.emailNormalized) {
      await tx.consentRecord.create({ data: { accountId: contact.accountId, contactId: contact.id, emailNormalized: contact.emailNormalized, emailHash: hashEmail(contact.emailNormalized), status: 'GRANTED', legalBasis: consent.legalBasis, source: consent.source ?? 'manual', countryCode: contact.countryCode } });
    }
  },
});

export function contactFilters(q) {
  return {
    ...(q.companyId ? { companyId: q.companyId } : {}),
    ...(q.countryCode ? { countryCode: q.countryCode } : {}),
    ...(q.listId ? { listMemberships: { some: { listId: q.listId } } } : {}),
    ...(q.hasEmail === 'true' ? { emailNormalized: { not: null } } : q.hasEmail === 'false' ? { emailNormalized: null } : {}),
  };
}

export async function createContact(scope, body, ctx) {
  return contactService.create(scope, body, { ...ctx, pendingConsent: body.consent });
}

export async function recordConsent(scope, id, input, ctx) {
  const { record, access } = await getRecordAccess(scope, 'CONTACT', id);
  assertCanEdit(access, 'contact');
  if (!record.emailNormalized) throw new AppError(400, 'NO_EMAIL', 'This contact has no email address.');
  const row = await prisma.consentRecord.create({
    data: { accountId: record.accountId, contactId: id, emailNormalized: record.emailNormalized, emailHash: hashEmail(record.emailNormalized), status: input.status, legalBasis: input.legalBasis, source: input.source ?? 'manual', evidence: input.evidence, countryCode: record.countryCode, withdrawnAt: input.status === 'WITHDRAWN' ? new Date() : null },
  });
  await writeAudit({ accountId: record.accountId, workspaceId: record.ownerWorkspaceId, action: `contact.consent_${input.status.toLowerCase()}`, entityType: 'CONTACT', entityId: id, after: { legalBasis: input.legalBasis, source: input.source }, ctx });
  return row;
}

/** Right to erasure: anonymises the person everywhere and keeps only a hashed suppression so they are never emailed again. */
export async function eraseContact(scope, id, ctx) {
  const { record, access } = await getRecordAccess(scope, 'CONTACT', id);
  assertCanManage(access, 'contact');
  const hash = record.emailNormalized ? hashEmail(record.emailNormalized) : null;
  await prisma.$transaction(async (tx) => {
    if (hash) {
      await tx.suppression.upsert({ where: { accountId_emailHash: { accountId: record.accountId, emailHash: hash } }, create: { accountId: record.accountId, emailHash: hash, reason: 'ERASURE', source: 'MANUAL' }, update: { reason: 'ERASURE', emailNormalized: null } });
      await tx.suppression.updateMany({ where: { accountId: record.accountId, emailHash: hash }, data: { emailNormalized: null } });
      await tx.unsubscribe.updateMany({ where: { accountId: record.accountId, emailHash: hash }, data: { emailNormalized: null, ip: null, userAgent: null } });
      await tx.consentRecord.updateMany({ where: { accountId: record.accountId, emailHash: hash }, data: { emailNormalized: null, evidence: null } });
      await tx.campaignRecipient.updateMany({ where: { emailNormalized: record.emailNormalized, campaign: { accountId: record.accountId } }, data: { email: 'erased', emailNormalized: `erased:${record.id}`, mergeData: null } });
      await tx.lead.updateMany({ where: { accountId: record.accountId, emailNormalized: record.emailNormalized }, data: { email: null, emailNormalized: null, phoneRaw: null, phoneE164: null, firstName: null, lastName: null, fullName: 'Erased', deletedAt: new Date() } });
    }
    await tx.emailListContact.deleteMany({ where: { contactId: id } });
    await tx.note.deleteMany({ where: { contactId: id } });
    await tx.contact.update({ where: { id }, data: { firstName: null, lastName: 'Erased', email: null, emailNormalized: null, phoneRaw: null, phoneE164: null, city: null, region: null, description: null, customFields: null, deletedAt: new Date() } });
    await writeAudit({ accountId: record.accountId, workspaceId: record.ownerWorkspaceId, action: 'contact.erase', entityType: 'CONTACT', entityId: id, ctx }, tx);
  });
  return { erased: true };
}

export async function importContacts(scope, file, opts, ctx) {
  const ws = await resolveWriteWorkspace(scope, opts.ownerWorkspaceId);
  if (opts.listId) {
    const list = await prisma.emailList.findFirst({ where: { id: opts.listId, ownerWorkspaceId: ws.id, deletedAt: null } });
    if (!list) throw notFound('Email list in this Sales ID');
  }
  const rows = await parseUpload(file);
  const job = await prisma.importJob.create({ data: { accountId: scope.accountId, workspaceId: ws.id, createdById: ctx.userId, entityType: opts.listId ? 'LIST_MEMBER' : 'CONTACT', targetListId: opts.listId, fileName: file.originalname, status: 'PROCESSING', totalRows: rows.length } });
  const tzMap = await countryTimezoneMap(prisma, scope.accountId);
  const companies = new Map();
  const errors = [];
  const seen = new Set();
  let createdCount = 0, updatedCount = 0, skippedCount = 0;
  const added = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    const email = pick(r, 'email', 'emailaddress', 'e-mail');
    const emailNormalized = normalizeEmail(email);
    const firstName = pick(r, 'firstname', 'first', 'name');
    const lastName = pick(r, 'lastname', 'last', 'surname');
    if (!emailNormalized && !firstName && !lastName) { errors.push({ line, message: 'Row has no name or email.' }); continue; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ line, message: `Invalid email "${email}".` }); continue; }
    if (opts.listId && !emailNormalized) { errors.push({ line, message: 'List members need an email.' }); continue; }
    if (emailNormalized && seen.has(emailNormalized)) { skippedCount++; continue; }
    if (emailNormalized) seen.add(emailNormalized);
    let countryCode = pick(r, 'country', 'countrycode')?.toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) countryCode = undefined;
    const phone = parsePhone(pick(r, 'phone', 'mobile'), countryCode);
    countryCode = countryCode ?? phone.phoneCountry ?? null;
    const tz = resolveTimezone({ timezone: pick(r, 'timezone'), countryCode, phoneCountry: phone.phoneCountry }, tzMap);
    let companyId = null;
    const companyName = pick(r, 'company', 'companyname', 'organization');
    if (companyName) {
      const key = companyName.toLowerCase().trim();
      if (!companies.has(key)) {
        const nameNormalized = key.replace(/\s+/g, ' ');
        const c = (await prisma.company.findFirst({ where: { ownerWorkspaceId: ws.id, nameNormalized, deletedAt: null } })) ??
          (await prisma.company.create({ data: { accountId: scope.accountId, ownerWorkspaceId: ws.id, name: companyName, nameNormalized } }));
        companies.set(key, c.id);
      }
      companyId = companies.get(key);
    }
    const data = {
      firstName: firstName ?? null, lastName: lastName ?? null, email: email?.toLowerCase() ?? null, emailNormalized, phoneRaw: phone.phoneRaw, phoneE164: phone.phoneE164,
      designation: pick(r, 'designation', 'title', 'jobtitle') ?? null, countryCode, region: pick(r, 'state', 'region') ?? null, city: pick(r, 'city') ?? null,
      timezone: tz.timezone, timezoneSource: tz.timezoneSource, source: pick(r, 'source') ?? 'Import', companyId,
    };
    let contactId;
    const existing = emailNormalized ? await prisma.contact.findFirst({ where: { ownerWorkspaceId: ws.id, emailNormalized, deletedAt: null }, select: { id: true } }) : null;
    if (existing) {
      contactId = existing.id;
      if (opts.updateExisting) {
        await prisma.contact.update({ where: { id: existing.id }, data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined)) });
        updatedCount++;
      } else if (!opts.listId) { skippedCount++; continue; }
    } else {
      contactId = (await prisma.contact.create({ data: { ...data, accountId: scope.accountId, ownerWorkspaceId: ws.id } })).id;
      createdCount++;
    }
    if (opts.consentBasis && emailNormalized) {
      await prisma.consentRecord.create({ data: { accountId: scope.accountId, contactId, emailNormalized, emailHash: hashEmail(emailNormalized), status: 'GRANTED', legalBasis: opts.consentBasis, source: 'import', countryCode, evidence: { file: file.originalname, line } } });
    }
    if (opts.listId) {
      const m = await prisma.emailListContact.upsert({ where: { listId_contactId: { listId: opts.listId, contactId } }, create: { listId: opts.listId, contactId, source: 'import' }, update: {} });
      if (m) added.push(contactId);
    }
  }
  const done = await prisma.importJob.update({ where: { id: job.id }, data: { status: errors.length ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', processedRows: rows.length, createdCount, updatedCount, skippedCount, errorCount: errors.length, errors: errors.slice(0, 500), completedAt: new Date() } });
  await writeAudit({ accountId: scope.accountId, workspaceId: ws.id, action: 'contact.import', entityType: 'ImportJob', entityId: job.id, metadata: { createdCount, updatedCount, skippedCount, errorCount: errors.length, listId: opts.listId ?? null }, ctx });
  if (opts.listId && added.length) publish('list.joined', { accountId: scope.accountId, workspaceId: ws.id, listId: opts.listId, contactIds: added });
  return done;
}
