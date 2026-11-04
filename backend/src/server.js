// API process entry point. Background workers run as a separate process
// (src/workers/workerBootstrap.js, added in Phase 6).
process.env.TZ = 'UTC';

const { default: config } = await import('./config/environment.js');
const { default: logger } = await import('./config/logger.js');
const { createApp } = await import('./app.js');
const { disconnectDatabase } = await import('./config/database.js');
const { closeRedisConnections } = await import('./config/redis.js');

const { registerAutomationTriggers } = await import('./modules/automations/automations.triggers.js');

registerAutomationTriggers();
const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'API listening');
});
server.keepAliveTimeout = 65_000; // longer than Render's load balancer idle timeout

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 25_000);
  force.unref();
  server.close(async () => {
    await Promise.allSettled([disconnectDatabase(), closeRedisConnections()]);
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
