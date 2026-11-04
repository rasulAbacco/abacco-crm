// Background worker process (Render "Background Worker"): campaign dispatch and
// sending, automations and reminders. Start with: npm run worker
process.env.TZ = 'UTC';
process.env.SERVICE_NAME ??= 'abacco-worker';

const { default: config } = await import('../config/environment.js');
const { default: logger } = await import('../config/logger.js');
const { workerManager } = await import('../queues/workerManager.js');
const { disconnectDatabase } = await import('../config/database.js');
const { closeRedisConnections } = await import('../config/redis.js');
const { closeAllTransports } = await import('../services/email/smtpTransport.js');
const campaign = await import('../modules/campaign/campaign.worker.js');
const automations = await import('../modules/automations/automations.worker.js');
const reminders = await import('../modules/tasks/tasks.reminders.js');

if (!config.REDIS_URL) {
  logger.fatal('REDIS_URL is required for the worker');
  process.exit(1);
}

campaign.register(workerManager);
automations.register(workerManager);
reminders.register(workerManager);
await workerManager.ready();
logger.info({ workers: workerManager.health() }, 'worker started');

const heartbeat = setInterval(() => logger.debug({ workers: workerManager.health() }, 'worker heartbeat'), 60_000);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'worker stopping: finishing current jobs');
  clearInterval(heartbeat);
  const force = setTimeout(() => process.exit(1), 60_000);
  force.unref();
  await workerManager.stopAll();
  closeAllTransports();
  await Promise.allSettled([disconnectDatabase(), closeRedisConnections()]);
  logger.info('worker stopped');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
