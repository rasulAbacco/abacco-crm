// Pure helpers for exact send pacing. No database, no Redis: easy to test.
//
//   emails per hour  ->  gap between two emails
//   100              ->  36 s
//    60              ->  60 s  (1 per minute)
//    50              ->  72 s
//    30              ->  2 min
//    15              ->  4 min

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** Milliseconds between two emails for a given hourly rate. */
export function intervalMs(perHour) {
  const n = Number(perHour);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error("Emails per hour must be a positive number.");
  return Math.round(3600000 / n);
}

/** Interval with optional random variation (jitterPercent 0 = exact spacing). Average stays the same. */
export function jitteredIntervalMs(
  perHour,
  jitterPercent = 0,
  rand = Math.random,
) {
  const base = intervalMs(perHour);
  const j = Math.max(0, Math.min(50, Number(jitterPercent) || 0)) / 100;
  if (!j) return base;
  return Math.max(1000, Math.round(base * (1 + (rand() * 2 - 1) * j)));
}

/** "1 email every 2 min", "1 email every 36 sec", "1 email every 1 min 12 sec". */
export function describeInterval(perHour) {
  const total = Math.round(intervalMs(perHour) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (!m) return `1 email every ${s} sec`;
  return s ? `1 email every ${m} min ${s} sec` : `1 email every ${m} min`;
}

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const fmtCache = new Map();
function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }
  return fmtCache.get(tz);
}

/** Local weekday (0 = Sunday) and minutes since midnight in a timezone. */
export function localParts(ms, tz) {
  const parts = Object.fromEntries(
    formatter(tz)
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return {
    day: DAY_NAMES.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

/**
 * Is sending allowed at this moment for this account?
 * window: { sendWindowStart:'09:00', sendWindowEnd:'18:00', sendDays:[1..5], sendTimezone }
 * No start/end means any time of day. A window like 22:00–06:00 crosses midnight; the day
 * check then uses the day the window started.
 */
export function isOpen(ms, w = {}) {
  const tz = w.sendTimezone || DEFAULT_TIMEZONE;
  const days =
    Array.isArray(w.sendDays) && w.sendDays.length
      ? w.sendDays
      : [0, 1, 2, 3, 4, 5, 6];
  const { day, minutes } = localParts(ms, tz);
  if (!w.sendWindowStart || !w.sendWindowEnd) return days.includes(day);
  const start = toMinutes(w.sendWindowStart);
  const end = toMinutes(w.sendWindowEnd);
  if (start === end) return days.includes(day);
  if (start < end)
    return days.includes(day) && minutes >= start && minutes < end;
  // Crosses midnight.
  if (minutes >= start) return days.includes(day);
  if (minutes < end) return days.includes((day + 6) % 7);
  return false;
}

/** The first moment (whole minute) at or after `ms` when sending is allowed, or null if never within 8 days. */
export function nextOpenTime(ms, w = {}) {
  if (isOpen(ms, w)) return ms;
  let t = Math.ceil(ms / 60000) * 60000;
  const limit = ms + 8 * 86400000;
  while (t <= limit) {
    if (isOpen(t, w)) return t;
    t += 60000;
  }
  return null;
}

/** How long a number of emails takes at a rate, e.g. 500 at 60/hr = 8 h 20 min. */
export function estimateDuration(count, perHour) {
  if (!count) return "0 min";
  const mins = Math.ceil(((count - 1) * intervalMs(perHour)) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
