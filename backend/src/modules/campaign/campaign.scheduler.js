// Send-time maths. All inputs/outputs are UTC instants; local times are
// computed in each recipient's IANA timezone with Luxon (DST-safe).
import { DateTime } from 'luxon';

const hm = (s) => s.split(':').map(Number);

/** Moves a time forward into the next business window (days, hours, holidays). */
export function nextBusinessTime(dt, { start = '09:00', end = '18:00', days = [1, 2, 3, 4, 5], holidays = new Set(), countryCode } = {}) {
  const [sh, sm] = hm(start);
  const [eh, em] = hm(end);
  let t = dt;
  for (let i = 0; i < 21; i++) {
    const dayStart = t.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const dayEnd = t.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    const isHoliday = countryCode && holidays.has(`${countryCode}:${t.toISODate()}`);
    if (!days.includes(t.weekday) || isHoliday || t >= dayEnd) {
      t = t.plus({ days: 1 }).set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
      continue;
    }
    return t < dayStart ? dayStart : t;
  }
  return t;
}

/**
 * campaign: { scheduleMode, scheduledAtUtc, localSendDate, localSendTime, pastTimeBehaviour, respectBusinessHours }
 * recipient: { timezone, countryCode }, business: { start, end, days }, holidays: Set("IN:2026-11-08")
 * → { at: Date } | { skip: 'PAST_LOCAL_TIME' }
 */
export function computeSendTime(campaign, recipient, { business, holidays, now = new Date() } = {}) {
  const nowDt = DateTime.fromJSDate(now, { zone: recipient.timezone || 'UTC' });
  let at;
  if (campaign.scheduleMode === 'IMMEDIATE') at = nowDt;
  else if (campaign.scheduleMode === 'FIXED_TIME') at = DateTime.fromJSDate(campaign.scheduledAtUtc).setZone(recipient.timezone || 'UTC');
  else {
    const date = campaign.localSendDate instanceof Date ? campaign.localSendDate.toISOString().slice(0, 10) : String(campaign.localSendDate).slice(0, 10);
    at = DateTime.fromISO(`${date}T${campaign.localSendTime}`, { zone: recipient.timezone || 'UTC' });
    if (at < nowDt) {
      if (campaign.pastTimeBehaviour === 'SKIP') return { skip: 'PAST_LOCAL_TIME' };
      if (campaign.pastTimeBehaviour === 'SEND_NOW') at = nowDt;
      else while (at < nowDt) at = at.plus({ days: 1 });
    }
  }
  if (campaign.respectBusinessHours) at = nextBusinessTime(at, { ...business, holidays, countryCode: recipient.countryCode });
  return { at: at.toUTC().toJSDate() };
}
