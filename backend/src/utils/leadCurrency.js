// Lead price currencies: every ISO 4217 currency (about 160), with USD, AUD, CAD and EUR first.
// The Excel/CSV "Currency" column is read per row, so one file can mix currencies.
// Accepted (any case): 3-letter codes (USD, INR, GBP…), English names ("Indian Rupee",
// "Australian Dollar"), and common symbols (US$, A$, C$, €, £, ₹, ¥, S$, HK$, NZ$, R$…).
// A plain "$" or "dollar" is ambiguous and rejected.
import { z } from "zod";

export const PINNED_LEAD_CURRENCIES = ["USD", "AUD", "CAD", "EUR"];
const ALL = Intl.supportedValuesOf("currency");
export const LEAD_CURRENCIES = [
  ...PINNED_LEAD_CURRENCIES,
  ...ALL.filter((c) => !PINNED_LEAD_CURRENCIES.includes(c)),
];
const CODES = new Set(LEAD_CURRENCIES);
export const DEFAULT_LEAD_CURRENCY = "USD";

const squash = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]/g, "");

// Symbols and short forms people type in spreadsheets.
const SYMBOLS = {
  USD: ["us$", "usdollar", "americandollar"],
  AUD: ["a$", "au$", "aus$", "ausdollar"],
  CAD: ["c$", "ca$", "can$"],
  EUR: ["€", "euro", "euros"],
  GBP: ["£", "pound", "pounds", "poundsterling", "gbp£"],
  INR: ["₹", "rs", "inr₹", "rupee", "rupees"],
  JPY: ["¥", "yen", "jp¥"],
  CNY: ["rmb", "yuan", "cn¥", "renminbi"],
  NZD: ["nz$"],
  SGD: ["s$", "sg$"],
  HKD: ["hk$"],
  BRL: ["r$"],
  MXN: ["mx$", "mex$"],
  ZAR: ["rand"],
  CHF: ["fr", "sfr"],
  AED: ["dirham", "dhs"],
  KRW: ["₩", "won"],
  PHP: ["₱"],
  ILS: ["₪", "shekel"],
  NGN: ["₦", "naira"],
  TRY: ["₺", "lira"],
  RUB: ["₽", "rouble", "ruble"],
  THB: ["฿", "baht"],
  VND: ["₫", "dong"],
};
const LOOKUP = new Map();
const names = new Intl.DisplayNames(["en"], { type: "currency" });
for (const code of LEAD_CURRENCIES) {
  LOOKUP.set(code.toLowerCase(), code);
  const name = squash(names.of(code));
  if (name && !LOOKUP.has(name)) LOOKUP.set(name, code); // "indianrupee"
  if (name && !LOOKUP.has(`${name}s`)) LOOKUP.set(`${name}s`, code); // "australiandollars"
}
for (const [code, list] of Object.entries(SYMBOLS))
  for (const a of list) LOOKUP.set(a, code);

/** "usd" / "A$" / "Indian Rupee" / "₹" -> code; blank -> null; unknown -> undefined. */
export function parseLeadCurrency(value) {
  const s = squash(value);
  if (!s) return null;
  const hit = LOOKUP.get(s) ?? LOOKUP.get(s.replace(/\./g, ""));
  return hit && CODES.has(hit) ? hit : undefined;
}

/** Reads a currency hint from a price cell such as "A$1,200", "€ 950", "₹50000", "1200 CAD". */
export function currencyFromPrice(value) {
  const s = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return null;
  const m = /^([^\d\s.,]+)\s*[\d.,]+$|^[\d.,]+\s*([^\d\s.,]+)$/u.exec(s);
  const token = m?.[1] ?? m?.[2];
  if (!token || token === "$") return null;
  return parseLeadCurrency(token) ?? null;
}

const unknownMessage = (v) =>
  `Currency "${v}" is not recognised. Use a 3-letter currency code such as USD, EUR, GBP or INR.`;

/**
 * Decides one import row's currency.
 * Order: the row's Currency column -> a symbol in the price cells -> the import default -> USD.
 * Returns { currency } or { error }.
 */
export function resolveRowCurrency({ column, prices = [], importDefault }) {
  if (column !== undefined && column !== null && String(column).trim() !== "") {
    const c = parseLeadCurrency(column);
    if (!c) return { error: unknownMessage(column) };
    return { currency: c };
  }
  const fromPrices = [
    ...new Set(prices.map(currencyFromPrice).filter(Boolean)),
  ];
  if (fromPrices.length > 1)
    return {
      error: `Prices in this row use different currencies (${fromPrices.join(", ")}).`,
    };
  if (fromPrices.length === 1) return { currency: fromPrices[0] };
  return {
    currency: parseLeadCurrency(importDefault) ?? DEFAULT_LEAD_CURRENCY,
  };
}

export const leadCurrencyField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const c = parseLeadCurrency(v);
    if (!c) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: unknownMessage(v) });
      return z.NEVER;
    }
    return c;
  });
