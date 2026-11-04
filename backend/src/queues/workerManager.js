// Registers BullMQ workers and repeatable jobs, and shuts them down cleanly
// (finish the current job, then stop) on SIGTERM.
import { Worker } from 'bullmq';
import { bullConnection, getQueue, closeQueues } from './queueRegistry.js';
import logger from '../config/logger.js';

const workers = [];
const schedules = [];

export const workerManager = {
  /** processor(job) → result; opts: { concurrency, limiter } */
  register(queueName, processor, opts = {}) {
    const w = new Worker(queueName, processor, { connection: bullConnection(), concurrency: opts.concurrency ?? 1, lockDuration: opts.lockDuration ?? 120_000, ...opts });
    w.on('failed', (job, err) => logger.error({ queue: queueName, jobId: job?.id, err: { message: err.message } }, 'job failed'));
    w.on('error', (err) => logger.error({ queue: queueName, err: { message: err.message } }, 'worker error'));
    workers.push(w);
    return w;
  },
  /** Repeating job (idempotent across restarts thanks to the scheduler id). */
  every(queueName, id, ms, data = {}) {
    schedules.push(getQueue(queueName).upsertJobScheduler(id, { every: ms }, { name: id, data }));
  },
  async ready() {
    await Promise.all(schedules);
    await Promise.all(workers.map((w) => w.waitUntilReady()));
  },
  async stopAll() {
    await Promise.allSettled(workers.map((w) => w.close()));
    await closeQueues();
  },
  health() {
    return workers.map((w) => ({ queue: w.name, running: w.isRunning() }));
  },
};

export default workerManager;
