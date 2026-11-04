import prisma from '../../prisma/client.js';
import { resolveWriteWorkspace } from '../../middleware/salesIdMiddleware.js';
import { notFound } from '../../utils/errors.js';
import { toOrderBy, toSkipTake } from '../../utils/pagination.js';
import { sanitizeEmailHtml, personalize, htmlToText, MERGE_FIELDS } from '../../services/email/messageBuilder.js';
import { writeAudit } from '../../services/audit/auditService.js';
import { buildScopeWhere } from '../../utils/scope.js';

// A template is either shared (ownerWorkspaceId = null) or belongs to one Sales ID.
const scopeWhere = (scope) => ({ accountId: scope.accountId, deletedAt: null, ...(scope.mode === 'single' ? { OR: [{ ownerWorkspaceId: scope.workspaceId }, { ownerWorkspaceId: null }] } : {}) });

async function find(scope, id) {
  const t = await prisma.emailTemplate.findFirst({ where: { id, ...scopeWhere(scope) } });
  if (!t) throw notFound('Template');
  return t;
}

export async function list(scope, q) {
  const where = { ...scopeWhere(scope), ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}) };
  const [items, total] = await Promise.all([
    prisma.emailTemplate.findMany({ where, orderBy: [toOrderBy(q.sort, ['name', 'createdAt', 'updatedAt'], { updatedAt: 'desc' })], ...toSkipTake(q), select: { id: true, name: true, subject: true, preheader: true, ownerWorkspaceId: true, ownerWorkspace: { select: { code: true, name: true } }, createdAt: true, updatedAt: true } }),
    prisma.emailTemplate.count({ where }),
  ]);
  return { items, total };
}

export const get = (scope, id) => find(scope, id);

export async function create(scope, { ownerWorkspaceId, shared, ...data }, ctx) {
  const ws = shared ? null : await resolveWriteWorkspace(scope, ownerWorkspaceId);
  const t = await prisma.emailTemplate.create({ data: { ...data, html: sanitizeEmailHtml(data.html), accountId: scope.accountId, ownerWorkspaceId: ws?.id ?? null } });
  await writeAudit({ accountId: scope.accountId, workspaceId: ws?.id, action: 'template.create', entityType: 'EmailTemplate', entityId: t.id, after: { name: t.name }, ctx });
  return t;
}

export async function update(scope, id, data, ctx) {
  const t = await find(scope, id);
  const u = await prisma.emailTemplate.update({ where: { id }, data: { ...data, ...(data.html ? { html: sanitizeEmailHtml(data.html) } : {}) } });
  await writeAudit({ accountId: scope.accountId, workspaceId: t.ownerWorkspaceId, action: 'template.update', entityType: 'EmailTemplate', entityId: id, ctx });
  return u;
}

export async function remove(scope, id, ctx) {
  const t = await find(scope, id);
  await prisma.emailTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({ accountId: scope.accountId, workspaceId: t.ownerWorkspaceId, action: 'template.delete', entityType: 'EmailTemplate', entityId: id, ctx });
  return { deleted: true };
}

export async function duplicate(scope, id, ctx) {
  const t = await find(scope, id);
  return create(scope, { name: `${t.name} (copy)`, subject: t.subject, preheader: t.preheader, html: t.html, text: t.text, design: t.design ?? undefined, ownerWorkspaceId: t.ownerWorkspaceId ?? undefined, shared: !t.ownerWorkspaceId }, ctx);
}

/** Renders HTML with a real contact's data (or sample values) — nothing is sent. */
export async function preview(scope, { html, subject, contactId }) {
  let vars = { firstName: 'Priya', lastName: 'Sharma', fullName: 'Priya Sharma', email: 'priya@example.com', company: 'Example Pvt Ltd', designation: 'Head of Sales', city: 'Mumbai', country: 'IN', unsubscribeUrl: '#unsubscribe' };
  if (contactId) {
    const where = await buildScopeWhere(scope, 'CONTACT');
    const c = await prisma.contact.findFirst({ where: { AND: [where, { id: contactId }] }, include: { company: { select: { name: true } } } });
    if (c) vars = { ...vars, firstName: c.firstName, lastName: c.lastName, fullName: [c.firstName, c.lastName].filter(Boolean).join(' '), email: c.email, company: c.company?.name, designation: c.designation, city: c.city, country: c.countryCode };
  }
  const clean = sanitizeEmailHtml(html ?? '');
  const rendered = personalize(clean, vars, { html: true });
  return { subject: personalize(subject ?? '', vars), html: rendered, text: htmlToText(rendered), mergeFields: MERGE_FIELDS };
}
