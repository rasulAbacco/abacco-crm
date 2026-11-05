import { z } from "zod";
import { listQuerySchema } from "../../utils/pagination.js";
import { timezoneSchema } from "../auth/auth.validator.js";

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z]{3}$/,
    "Use a 3-letter ISO 4217 currency code, e.g. INR, USD, EUR.",
  )
  .refine((c) => {
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: c });
      return true;
    } catch {
      return false;
    }
  }, "Unknown currency code.");

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour).");

export const idParams = z.object({ id: z.string().uuid() });

export const salesIdCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9_-]{1,19}$/,
    "Use 2–20 letters, digits, - or _ (e.g. REP-101).",
  );

const base = {
  code: salesIdCode.optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  defaultCurrency: currencySchema.nullable().optional(),
  defaultTimezone: timezoneSchema.nullable().optional(),
  senderLegalName: z.string().trim().max(200).nullable().optional(),
  senderPostalAddress: z.string().trim().max(500).nullable().optional(),
};

export const createSchema = z
  .object({ ...base, isDefault: z.boolean().optional() })
  .strict();

export const updateSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(base).map(([k, v]) => [k, v.optional()]),
    ),
    settings: z
      .object({
        businessHoursStart: hhmm.optional(),
        businessHoursEnd: hhmm.optional(),
        businessDays: z
          .array(z.number().int().min(1).max(7))
          .min(1)
          .max(7)
          .optional(),
        emailFooterHtml: z.string().max(5000).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update.");

export const statusSchema = z
  .object({ status: z.enum(["ACTIVE", "INACTIVE"]) })
  .strict();

export const deleteSchema = z
  .object({
    confirmCode: z.string().trim().min(1),
    transferToId: z.string().uuid().optional(),
  })
  .strict();

export const listSchema = listQuerySchema.extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  includeStats: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});
