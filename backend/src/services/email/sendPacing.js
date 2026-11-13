// Exact send pacing per SMTP account.
//
// The user sets "emails per hour" on each SMTP account (Settings → Sending speed).
// Emails from that account are spread evenly through the hour:
//   60/hr → one every 60 s · 30/hr → one every 2 min · 100/hr → one every 36 s.
//
// How it works
//  * smtp_accounts."nextSendAt" is the earliest moment the account's next email may go.
//  * The dispatcher books a slot with ONE atomic UPDATE:
//        slot = max(now, nextSendAt);  nextSendAt = slot + gap
//    so campaigns sharing an account, and several dispatcher runs, always land one gap apart.
//  * The recipient is then queued as a BullMQ job delayed until exactly that slot, so no
//    worker sits waiting and other accounts keep sending.
//  * Slots are booked at most LOOKAHEAD_MS ahead (a little longer than one dispatcher run),
//    so a pause or a speed change takes effect within seconds.
//  * It lives in Postgres: a restart or a Redis outage never causes a burst.
//  * Optional sending days / hours per account, in the account's timezone.
//  * The rolling hourly / daily limits in rateLimiter.js still apply on top as a safety net.
import prisma from "../../prisma/client.js";
import logger from "../../config/logger.js";
import {
  jitteredIntervalMs,
  nextOpenTime,
  isOpen,
} from "../../utils/sendSchedule.js";

export const LOOKAHEAD_MS = 20 * 1000;

/** Columns the dispatcher needs to pace an account. */
export const PACE_SELECT = {
  id: true,
  hourlyLimit: true,
  isEnabled: true,
  pacingEnabled: true,
  paceJitterPercent: true,
  sendWindowStart: true,
  sendWindowEnd: true,
  sendDays: true,
  sendTimezone: true,
};

export const isPaced = (account) =>
  !!account && account.pacingEnabled !== false && account.hourlyLimit > 0;

/**
 * Books the account's next send slot if it falls within the lookahead.
 * Returns { ok: true, slotAt, bookedNext } or { ok: false, until, reason }.
 */
export async function bookSendSlot(
  account,
  { now = Date.now(), lookaheadMs = LOOKAHEAD_MS } = {},
) {
  const openAt = nextOpenTime(now, account);
  if (openAt === null)
    return { ok: false, until: null, reason: "NO_SENDING_DAYS" };
  if (openAt > now + lookaheadMs)
    return {
      ok: false,
      until: new Date(openAt),
      reason: "OUTSIDE_SENDING_HOURS",
    };

  const gapMs = jitteredIntervalMs(
    account.hourlyLimit,
    account.paceJitterPercent,
  );
  const base = new Date(Math.max(now, openAt));
  const limit = new Date(now + lookaheadMs);
  const rows = await prisma.$queryRaw`
    UPDATE smtp_accounts
       SET "nextSendAt" = GREATEST(COALESCE("nextSendAt", ${base}::timestamptz), ${base}::timestamptz)
                          + make_interval(secs => ${gapMs / 1000}::double precision)
     WHERE id = ${account.id}::uuid
       AND GREATEST(COALESCE("nextSendAt", ${base}::timestamptz), ${base}::timestamptz) <= ${limit}::timestamptz
    RETURNING "nextSendAt"`;
  if (!rows.length)
    return { ok: false, until: null, reason: "NEXT_SLOT_LATER" };

  const bookedNext = new Date(rows[0].nextSendAt);
  const slotAt = bookedNext.getTime() - gapMs;
  if (!isOpen(slotAt, account)) {
    // The queue pushed this slot past the end of the sending hours: give it back.
    await returnSendSlot(account.id, slotAt, bookedNext);
    return {
      ok: false,
      until: new Date(nextOpenTime(slotAt, account) ?? slotAt),
      reason: "OUTSIDE_SENDING_HOURS",
    };
  }
  return { ok: true, slotAt, bookedNext };
}

/** Gives a booked slot back when nothing was queued for it (only if nobody booked after it). */
export async function returnSendSlot(accountId, slotAt, bookedNext) {
  try {
    await prisma.$executeRaw`
      UPDATE smtp_accounts SET "nextSendAt" = ${new Date(slotAt)}::timestamptz
       WHERE id = ${accountId}::uuid AND "nextSendAt" = ${bookedNext}::timestamptz`;
  } catch (err) {
    logger.warn(
      { err: { message: err.message }, accountId },
      "pacing: could not return an unused slot",
    );
  }
}
