// Display helpers. Stored values are UTC instants and integer minor units.
import { useAuthStore } from '../store/authStore';

const userTz = () => useAuthStore.getState().user?.timezone ?? useAuthStore.getState().user?.account?.defaultTimezone ?? 'Asia/Kolkata';
const locale = () => useAuthStore.getState().user?.locale ?? useAuthStore.getState().user?.account?.defaultLocale ?? 'en-IN';

export function fractionDigits(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function formatMoney(minor, currency, opts = {}) {
  if (minor === null || minor === undefined || !currency) return '—';
  const digits = fractionDigits(currency);
  const value = Number(BigInt(minor)) / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency, maximumFractionDigits: opts.compact ? 1 : digits, notation: opts.compact ? 'compact' : 'standard' }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

/** [{currency, amountMinor}] → "₹5,000.00 · $1,200.50" */
export function formatMoneyList(list, opts) {
  if (!list?.length) return formatMoney(0, useAuthStore.getState().user?.account?.defaultCurrency ?? 'INR', opts);
  return list.map((m) => formatMoney(m.amountMinor, m.currency, opts)).join(' · ');
}

export function minorToInput(minor, currency) {
  if (minor === null || minor === undefined) return '';
  const d = fractionDigits(currency);
  const v = BigInt(minor);
  if (!d) return v.toString();
  const base = 10n ** BigInt(d);
  return `${v / base}.${(v % base).toString().padStart(d, '0')}`;
}

export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const d = new Date(value);
  return new Intl.DateTimeFormat(locale(), { timeZone: opts.timeZone ?? userTz(), day: '2-digit', month: 'short', year: 'numeric', ...(opts.time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(d);
}

export const formatDateTime = (v, opts = {}) => formatDate(v, { ...opts, time: true });

export function formatRelative(value) {
  if (!value) return '—';
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(value);
}

/** For <input type="datetime-local"> in the user's own browser zone. */
export function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || p?.fullName || p?.email || '—';
export const humanize = (s) => (s ? String(s).toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
export const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
export const num = (v) => new Intl.NumberFormat('en-IN').format(v ?? 0);
