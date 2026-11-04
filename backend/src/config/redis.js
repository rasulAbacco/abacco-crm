// Centralised Redis (Render Key Value / Valkey) connections.
// BullMQ needs maxRetriesPerRequest = null on worker connections, and the
// instance must run with maxmemory-policy=noeviction or queued jobs can vanish.
import IORedis from 'ioredis';
import config from './environment.js';
import logger from './logger.js';

const connections = new Set();

export function isRedisConfigured() {
  return Boolean(config.REDIS_URL);
}

export function createRedisConnection(name = 'default', { forBullMQ = false } = {}) {
  if (!config.REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }
  const conn = new IORedis(config.REDIS_URL, {
    connectionName: `abacco:${name}`,
    maxRetriesPerRequest: forBullMQ ? null : 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  conn.on('error', (err) => logger.error({ err: { message: err.message }, redis: name }, 'redis error'));
  connections.add(conn);
  return conn;
}

let shared;
export function getRedis() {
  if (!shared) shared = createRedisConnection('shared');
  return shared;
}

export async function checkRedis() {
  if (!isRedisConfigured()) return 'not_configured';
  const pong = await getRedis().ping();
  return pong === 'PONG' ? 'ok' : 'unexpected';
}

export async function closeRedisConnections() {
  await Promise.allSettled([...connections].map((c) => c.quit()));
  connections.clear();
  shared = undefined;
}
