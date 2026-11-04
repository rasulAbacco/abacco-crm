// One place that creates BullMQ queues on the shared Redis configuration.
import { Queue } from 'bullmq';
import { createRedisConnection, isRedisConfigured } from '../config/redis.js';

export const QUEUES = {
  CAMPAIGN_DISPATCH: 'campaign-dispatch',
  EMAIL_SEND: 'email-send',
  AUTOMATION: 'automation',
  MAINTENANCE: 'maintenance',
};

const queues = new Map();
let connection;

export function bullConnection() {
  if (!connection) connection = createRedisConnection('bullmq', { forBullMQ: true });
  return connection;
}

export function getQueue(name) {
  if (!isRedisConfigured()) return null;
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: bullConnection(),
        defaultJobOptions: { removeOnComplete: { age: 24 * 3600, count: 5000 }, removeOnFail: { age: 7 * 24 * 3600 } },
      }),
    );
  }
  return queues.get(name);
}

export async function closeQueues() {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
