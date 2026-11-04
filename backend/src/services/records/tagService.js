// Tags are account-wide labels attached to leads, contacts, companies and deals.
import prisma from '../../prisma/client.js';

export async function setTags(tx, accountId, entityType, entityId, names) {
  if (!Array.isArray(names)) return;
  const clean = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))].slice(0, 30);
  await tx.entityTag.deleteMany({ where: { entityType, entityId } });
  for (const name of clean) {
    const tag = await tx.tag.upsert({ where: { accountId_name: { accountId, name } }, create: { accountId, name }, update: {} });
    await tx.entityTag.create({ data: { tagId: tag.id, entityType, entityId } });
  }
}

export async function tagsFor(entityType, ids, db = prisma) {
  if (!ids.length) return new Map();
  const rows = await db.entityTag.findMany({ where: { entityType, entityId: { in: ids } }, include: { tag: { select: { id: true, name: true, color: true } } } });
  const map = new Map();
  for (const r of rows) map.set(r.entityId, [...(map.get(r.entityId) ?? []), r.tag]);
  return map;
}

export async function idsWithTag(accountId, entityType, tagName, db = prisma) {
  const rows = await db.entityTag.findMany({ where: { entityType, tag: { accountId, name: tagName } }, select: { entityId: true } });
  return rows.map((r) => r.entityId);
}

export async function listTags(accountId) {
  return prisma.tag.findMany({ where: { accountId }, orderBy: { name: 'asc' }, include: { _count: { select: { entities: true } } } });
}
