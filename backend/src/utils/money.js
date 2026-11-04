// Money is typed by the user as a decimal ("12500.50") and stored as integer
// minor units in the currency's own precision (INR/USD 2, JPY 0, KWD 3).
// Nothing is ever converted between currencies.
import { z } from 'zod';
import { badRequest } from './errors.js';

export function fractionDigits(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
}

export function toMinor(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return null;
  const s = String(amount).trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) throw badRequest('Amount must be a positive number.');
  const digits = fractionDigits(currency);
  const [whole, frac = ''] = s.split('.');
  if (frac.length > digits) throw badRequest(`${currency} allows at most ${digits} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(digits) + BigInt((frac + '0'.repeat(digits)).slice(0, digits) || '0');
}

export function fromMinor(minor, currency) {
  if (minor === null || minor === undefined) return null;
  const digits = fractionDigits(currency);
  const v = BigInt(minor);
  if (digits === 0) return v.toString();
  const base = 10n ** BigInt(digits);
  return `${v / base}.${(v % base).toString().padStart(digits, '0')}`;
}

export const amountField = z.union([z.string(), z.number()]).transform((v) => String(v));

export const currencyField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.')
  .refine((c) => {
    try {
      fractionDigits(c);
      return true;
    } catch {
      return false;
    }
  }, 'Unknown currency code.');
