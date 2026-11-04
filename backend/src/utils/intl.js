// International helpers: phone numbers (E.164), timezones and countries.
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

export function isValidTimezone(tz) {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezoneField = z.string().refine(isValidTimezone, 'Unknown IANA timezone.');
export const countryField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use a 2-letter country code (e.g. IN, US, GB).');

/** Parses any phone format; returns E.164 + detected country, keeping the raw input. */
export function parsePhone(raw, defaultCountry) {
  if (!raw) return { phoneRaw: null, phoneE164: null, phoneCountry: null };
  const phoneRaw = String(raw).trim();
  const parsed = parsePhoneNumberFromString(phoneRaw, defaultCountry || undefined);
  if (parsed && parsed.isValid()) {
    return { phoneRaw, phoneE164: parsed.number, phoneCountry: parsed.country ?? null };
  }
  return { phoneRaw, phoneE164: null, phoneCountry: null };
}

/**
 * Timezone for a person, most specific first:
 * explicit value → phone country → country profile → account default.
 */
export function resolveTimezone({ timezone, countryCode, phoneCountry }, countryTz, fallback) {
  if (timezone && isValidTimezone(timezone)) return { timezone, timezoneSource: 'EXPLICIT' };
  if (phoneCountry && countryTz[phoneCountry]) return { timezone: countryTz[phoneCountry], timezoneSource: 'PHONE' };
  if (countryCode && countryTz[countryCode]) return { timezone: countryTz[countryCode], timezoneSource: 'COUNTRY' };
  return { timezone: null, timezoneSource: 'DEFAULT', fallback };
}

export async function countryTimezoneMap(db, accountId) {
  const rows = await db.countryProfile.findMany({ where: { accountId }, select: { code: true, defaultTimezone: true } });
  return Object.fromEntries(rows.map((r) => [r.code, r.defaultTimezone]));
}

/** Applies phone + timezone normalisation to a person-like payload (lead/contact). */
export async function normalizePerson(db, accountId, data, existing = {}) {
  const out = { ...data };
  const countryCode = data.countryCode !== undefined ? data.countryCode : existing.countryCode;
  if (data.phone !== undefined) {
    const p = parsePhone(data.phone, countryCode);
    out.phoneRaw = p.phoneRaw;
    out.phoneE164 = p.phoneE164;
    if (!countryCode && p.phoneCountry) out.countryCode = p.phoneCountry;
    out._phoneCountry = p.phoneCountry;
  }
  delete out.phone;
  if (data.timezone !== undefined || data.countryCode !== undefined || data.phone !== undefined) {
    const map = await countryTimezoneMap(db, accountId);
    const tz = resolveTimezone(
      { timezone: data.timezone !== undefined ? data.timezone : existing.timezoneSource === 'EXPLICIT' ? existing.timezone : null, countryCode: out.countryCode ?? countryCode, phoneCountry: out._phoneCountry },
      map,
    );
    out.timezone = tz.timezone;
    out.timezoneSource = tz.timezoneSource;
  }
  delete out._phoneCountry;
  return out;
}
