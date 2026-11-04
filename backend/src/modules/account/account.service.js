import prisma from '../../prisma/client.js';
import { notFound } from '../../utils/errors.js';
import { writeAudit } from '../../services/audit/auditService.js';

const ACCOUNT_FIELDS = {
  id: true,
  name: true,
  defaultCurrency: true,
  defaultTimezone: true,
  defaultLocale: true,
  legalName: true,
  postalAddress: true,
  createdAt: true,
  updatedAt: true,
};

export async function getAccount(accountId) {
  return prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: ACCOUNT_FIELDS });
}

export async function updateAccount(accountId, data, ctx) {
  const before = await getAccount(accountId);
  return prisma.$transaction(async (tx) => {
    const after = await tx.account.update({ where: { id: accountId }, data, select: ACCOUNT_FIELDS });
    await writeAudit({ accountId, action: 'account.update', entityType: 'Account', entityId: accountId, before, after, ctx }, tx);
    return after;
  });
}

export async function listCountries(accountId) {
  return prisma.countryProfile.findMany({ where: { accountId }, orderBy: { name: 'asc' } });
}

export async function upsertCountry(accountId, code, data, ctx) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.countryProfile.upsert({
      where: { accountId_code: { accountId, code } },
      create: { accountId, code, ...data },
      update: data,
    });
    await writeAudit({ accountId, action: 'country_profile.upsert', entityType: 'CountryProfile', entityId: code, after: row, ctx }, tx);
    return row;
  });
}

export async function deleteCountry(accountId, code, ctx) {
  const row = await prisma.countryProfile.findUnique({ where: { accountId_code: { accountId, code } } });
  if (!row) throw notFound('Country profile');
  await prisma.$transaction(async (tx) => {
    await tx.countryProfile.delete({ where: { id: row.id } });
    await writeAudit({ accountId, action: 'country_profile.delete', entityType: 'CountryProfile', entityId: code, before: row, ctx }, tx);
  });
}
