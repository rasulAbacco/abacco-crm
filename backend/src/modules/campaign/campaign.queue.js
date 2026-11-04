// Campaign queue helpers. The API never sends mail: it only writes recipient
// rows to Postgres and, when Redis is configured, nudges the dispatcher.
import { getQueue, QUEUES } from '../../queues/queueRegistry.js';
import logger from '../../config/logger.js';

export async function nudgeDispatcher() {
  const q = getQueue(QUEUES.CAMPAIGN_DISPATCH);
  if (!q) return;
  try {
    await q.add('dispatch-now', {}, { jobId: `nudge-${Math.floor(Date.now() / 5000)}`, removeOnComplete: true, removeOnFail: true });
  } catch (err) {
    logger.warn({ err: { message: err.message } }, 'could not nudge dispatcher; it will run on its schedule');
  }
}

/** One job per queuing (jobId includes the queue time). A duplicate job is harmless: only one worker can claim the row. */
export async function enqueueSends(recipients) {
  const q = getQueue(QUEUES.EMAIL_SEND);
  await q.addBulk(recipients.map((r) => ({ name: 'send', data: { recipientId: r.id }, opts: { jobId: `r-${r.id}-${r.attempts}-${new Date(r.queuedAt ?? Date.now()).getTime()}`, attempts: 1 } })));
}
