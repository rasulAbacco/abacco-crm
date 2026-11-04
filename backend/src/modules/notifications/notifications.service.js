import prisma from '../../prisma/client.js';

export async function listNotifications(userId, { unreadOnly }) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}
export const markRead = (userId, id) => prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
export const markAllRead = (userId) => prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });

/** Notifies every active user of the account (single primary user today, more later). */
export async function notifyAccount(accountId, { type, title, body, link }, db = prisma) {
  const users = await db.user.findMany({ where: { accountId, isActive: true }, select: { id: true } });
  if (!users.length) return;
  await db.notification.createMany({ data: users.map((u) => ({ accountId, userId: u.id, type, title, body, link })) });
}
