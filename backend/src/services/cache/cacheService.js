// Short-lived read-through cache (Redis). Without Redis it simply computes.
import { getRedis, isRedisConfigured } from '../../config/redis.js';
import logger from '../../config/logger.js';

export async function cached(key, ttlSeconds, compute) {
  if (!isRedisConfigured()) return compute();
  try {
    const hit = await getRedis().get(`cache:${key}`);
    if (hit) return JSON.parse(hit);
  } catch (err) {
    logger.warn({ err: { message: err.message } }, 'cache read failed');
  }
  const value = await compute();
  try {
    await getRedis().set(`cache:${key}`, JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: { message: err.message } }, 'cache write failed');
  }
  return value;
}

export async function invalidate(prefix) {
  if (!isRedisConfigured()) return;
  const r = getRedis();
  let cursor = '0';
  do {
    const [next, keys] = await r.scan(cursor, 'MATCH', `cache:${prefix}*`, 'COUNT', 200);
    if (keys.length) await r.del(...keys);
    cursor = next;
  } while (cursor !== '0');
}
