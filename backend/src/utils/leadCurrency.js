// Lead price currencies: USD, AUD, CAD, EUR.
// The Excel/CSV "Currency" column is read per row, so one file can mix currencies.
// Accepted spellings (any case): USD, US$, US Dollar · AUD, A$, AU$, Australian Dollar ·
// CAD, C$, CA$, Canadian Dollar · EUR, €, Euro. A plain "$" or "dollar" is ambiguous and rejected.
import { z } from "zod";

export const LEAD_CURRENCIES = ["USD", "AUD", "CAD", "EUR"];
export const LEAD_CURRENCY_LABELS = {
  USD: "USD – US Dollar",
  AUD: "AUD – Australian Dollar",
  CAD: "CAD – Canadian Dollar",
  EUR: "EUR – Euro",
};
export const DEFAULT_LEAD_CURRENCY = "USD";

const ALIASES = {
  USD: [
    "usd",
    "us$",
    "u.s.$",
    "usdollar",
    "usdollars",
    "unitedstatesdollar",
    "americandollar",
  ],
  AUD: [
    "aud",
    "a$",
    "au$",
    "aus$",
    "australiandollar",
    "australiandollars",
    "ausdollar",
  ],
  CAD: ["cad", "c$", "ca$", "can$", "canadiandollar", "canadiandollars"],
  EUR: ["eur", "€", "euro", "euros"],
};
const LOOKUP = new Map(
  Object.entries(ALIASES).flatMap(([code, list]) => list.map((a) => [a, code])),
);

const squash = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]/g, "");

/** "usd" / "A$" / "Euro" -> "USD" / "AUD" / "EUR"; blank -> null; unknown -> undefined. */
export function parseLeadCurrency(value) {
  const s = squash(value);
  if (!s) return null;
  return LOOKUP.get(s) ?? LOOKUP.get(s.replace(/\./g, "")) ?? undefined;
}

/** Reads a currency hint from a price cell such as "A$1,200", "€ 950", "1200 CAD". */
export function currencyFromPrice(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (s.includes("€")) return "EUR";
  const m = /^([a-z$.]+)\s*[\d.,]+$|^[\d.,]+\s*([a-z$.]+)$/i.exec(
    s.replace(/\s+/g, " "),
  );
  const token = m?.[1] ?? m?.[2];
  if (!token || token === "$") return null;
  return parseLeadCurrency(token) ?? null;
}

/**
 * Decides one import row's currency.
 * Order: the row's Currency column -> a symbol in the price cells -> the import default -> USD.
 * Returns { currency } or { error }.
 */
export function resolveRowCurrency({ column, prices = [], importDefault }) {
  if (column !== undefined && column !== null && String(column).trim() !== "") {
    const c = parseLeadCurrency(column);
    if (!c)
      return {
        error: `Currency "${column}" is not supported. Use USD, AUD, CAD or EUR.`,
      };
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
  const d = parseLeadCurrency(importDefault);
  return { currency: d ?? DEFAULT_LEAD_CURRENCY };
}

export const leadCurrencyField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const c = parseLeadCurrency(v);
    if (!c) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency must be USD, AUD, CAD or EUR.",
      });
      return z.NEVER;
    }
    return c;
  });
