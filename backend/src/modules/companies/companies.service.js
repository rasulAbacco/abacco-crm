import { createRecordService } from '../../services/records/recordService.js';
import { normalizeName } from '../../utils/normalize.js';
import { parsePhone } from '../../utils/intl.js';
import { conflict } from '../../utils/errors.js';

function domainOf(website) {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

async function prepare({ input, workspace, existing, db }) {
  const data = { ...input };
  if (data.name !== undefined) {
    data.nameNormalized = normalizeName(data.name);
    const wsId = existing?.ownerWorkspaceId ?? workspace.id;
    if (data.nameNormalized !== existing?.nameNormalized) {
      const dup = await db.company.findFirst({ where: { ownerWorkspaceId: wsId, nameNormalized: data.nameNormalized, deletedAt: null }, select: { id: true } });
      if (dup) throw conflict(`A company named ${data.name} already exists in this Sales ID.`, 'DUPLICATE_COMPANY', { existingId: dup.id });
    }
  }
  if (data.website !== undefined) data.domain = domainOf(data.website);
  if (data.phone !== undefined) {
    const p = parsePhone(data.phone, data.countryCode ?? existing?.countryCode);
    data.phoneRaw = p.phoneRaw;
    data.phoneE164 = p.phoneE164;
    delete data.phone;
  }
  return data;
}

export const companyService = createRecordService({
  entityType: 'COMPANY',
  searchFields: ['name', 'domain', 'industry', 'city'],
  sortable: ['createdAt', 'updatedAt', 'name', 'industry'],
  listInclude: { _count: { select: { contacts: { where: { deletedAt: null } }, deals: { where: { deletedAt: null } }, leads: { where: { deletedAt: null } } } } },
  detailInclude: {
    contacts: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, email: true, designation: true } },
    leads: { where: { deletedAt: null }, select: { id: true, fullName: true, email: true, status: true } },
    deals: { where: { deletedAt: null }, select: { id: true, title: true, amountMinor: true, currency: true, status: true, stage: { select: { name: true } } } },
    tasks: { where: { deletedAt: null }, select: { id: true, title: true, status: true, dueAt: true } },
  },
  prepare,
  titleOf: (r) => r.name,
});

export function companyFilters(q) {
  return {
    ...(q.industry ? { industry: { equals: q.industry, mode: 'insensitive' } } : {}),
    ...(q.countryCode ? { countryCode: q.countryCode } : {}),
  };
}
