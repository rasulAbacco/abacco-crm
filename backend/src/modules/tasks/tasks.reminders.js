// Task reminders → in-app notifications (runs in the worker process).
import prisma from '../../prisma/client.js';
import { QUEUES } from '../../queues/queueRegistry.js';

export async function reminderTick(now = new Date()) {
  const due = await prisma.task.findMany({ where: { deletedAt: null, status: { in: ['TODO', 'IN_PROGRESS'] }, remindAt: { lte: now }, reminderSentAt: null }, take: 500 });
  for (const t of due) {
    const claimed = await prisma.task.updateMany({ where: { id: t.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    const users = await prisma.user.findMany({ where: { accountId: t.accountId, isActive: true }, select: { id: true } });
    await prisma.notification.createMany({ data: users.map((u) => ({ accountId: t.accountId, userId: u.id, type: 'task.reminder', title: `Reminder: ${t.title}`, body: t.dueAt ? `Due ${t.dueAt.toISOString()}` : null, link: `/tasks?open=${t.id}` })) });
  }
  return { reminded: due.length };
}

export function register(workerManager) {
  workerManager.register(QUEUES.MAINTENANCE, async () => reminderTick(), { concurrency: 1 });
  workerManager.every(QUEUES.MAINTENANCE, 'task-reminders', 60_000);
}
