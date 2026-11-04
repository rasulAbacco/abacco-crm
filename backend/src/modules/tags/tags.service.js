import prisma from '../../prisma/client.js';
import { notFound } from '../../utils/errors.js';
export { listTags } from '../../services/records/tagService.js';

export async function updateTag(accountId, id, data) {
  const t = await prisma.tag.findFirst({ where: { id, accountId } });
  if (!t) throw notFound('Tag');
  return prisma.tag.update({ where: { id }, data });
}
export async function deleteTag(accountId, id) {
  const t = await prisma.tag.findFirst({ where: { id, accountId } });
  if (!t) throw notFound('Tag');
  await prisma.tag.delete({ where: { id } });
  return { deleted: true };
}
