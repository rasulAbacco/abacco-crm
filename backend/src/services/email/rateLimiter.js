// Rolling-window send limits per SMTP account (last 60 minutes and last 24
// hours), enforced atomically in Redis so several workers never overshoot.
// Postgres keeps a durable per-hour/day mirror (smtp_usage_windows) for reports.
import { getRedis, isRedisConfigured } from '../../config/redis.js';
import prisma from '../../prisma/client.js';

const RESERVE = `
local hourKey, dayKey = KEYS[1], KEYS[2]
local now, hourLimit, dayLimit, member = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
redis.call('ZREMRANGEBYSCORE', hourKey, '-inf', now - 3600000)
redis.call('ZREMRANGEBYSCORE', dayKey, '-inf', now - 86400000)
local h = redis.call('ZCARD', hourKey)
local d = redis.call('ZCARD', dayKey)
if h >= hourLimit then
  local oldest = redis.call('ZRANGE', hourKey, 0, 0, 'WITHSCORES')
  return {0, 'HOUR', tonumber(oldest[2]) + 3600000}
end
if d >= dayLimit then
  local oldest = redis.call('ZRANGE', dayKey, 0, 0, 'WITHSCORES')
  return {0, 'DAY', tonumber(oldest[2]) + 86400000}
end
redis.call('ZADD', hourKey, now, member)
redis.call('ZADD', dayKey, now, member)
redis.call('PEXPIRE', hourKey, 3700000)
redis.call('PEXPIRE', dayKey, 86500000)
return {1, 'OK', 0}
`;

const keys = (id) => [`smtp:rate:${id}:h`, `smtp:rate:${id}:d`];

/** Reserves one send slot. Returns { ok } or { ok:false, window, retryAt }. */
export async function reserveSlot(account, member) {
  if (!isRedisConfigured()) return reserveFromDatabase(account);
  const [ok, window, retryAt] = await getRedis().eval(RESERVE, 2, ...keys(account.id), Date.now(), account.hourlyLimit, account.dailyLimit, member);
  return ok === 1 ? { ok: true } : { ok: false, window, retryAt: new Date(Number(retryAt) + 1000) };
}

/** Gives the slot back when the message was not sent (auth/connection failure). */
export async function releaseSlot(account, member) {
  if (!isRedisConfigured()) return;
  const [h, d] = keys(account.id);
  await getRedis().multi().zrem(h, member).zrem(d, member).exec();
}

export async function currentUsage(accountIds) {
  const out = {};
  if (!isRedisConfigured()) {
    for (const id of accountIds) out[id] = await usageFromDatabase(id);
    return out;
  }
  const r = getRedis();
  const now = Date.now();
  for (const id of accountIds) {
    const [h, d] = keys(id);
    const [hour, day] = await Promise.all([r.zcount(h, now - 3600000, '+inf'), r.zcount(d, now - 86400000, '+inf')]);
    out[id] = { lastHour: hour, last24h: day };
  }
  return out;
}

async function usageFromDatabase(id) {
  const now = Date.now();
  const [hour, day] = await Promise.all([
    prisma.campaignRecipient.count({ where: { smtpAccountId: id, sentAt: { gte: new Date(now - 3600000) } } }),
    prisma.campaignRecipient.count({ where: { smtpAccountId: id, sentAt: { gte: new Date(now - 86400000) } } }),
  ]);
  return { lastHour: hour, last24h: day };
}

async function reserveFromDatabase(account) {
  const u = await usageFromDatabase(account.id);
  if (u.lastHour >= account.hourlyLimit) return { ok: false, window: 'HOUR', retryAt: new Date(Date.now() + 15 * 60000) };
  if (u.last24h >= account.dailyLimit) return { ok: false, window: 'DAY', retryAt: new Date(Date.now() + 60 * 60000) };
  return { ok: true };
}

/** Durable hourly/daily counters for reports. */
export async function recordUsage(smtpAccountId, { sent = 0, failed = 0 }, db = prisma) {
  const now = new Date();
  const hour = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (const [window, windowStart] of [['HOUR', hour], ['DAY', day]]) {
    await db.smtpUsageWindow.upsert({
      where: { smtpAccountId_window_windowStart: { smtpAccountId, window, windowStart } },
      create: { smtpAccountId, window, windowStart, sentCount: sent, failedCount: failed },
      update: { sentCount: { increment: sent }, failedCount: { increment: failed } },
    });
  }
}
