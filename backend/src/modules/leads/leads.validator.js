import { z } from "zod";
import { listQuerySchema } from "../../utils/pagination.js";
import { countryField, timezoneField } from "../../utils/intl.js";
import { amountField, currencyField } from "../../utils/money.js";

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "UNQUALIFIED",
  "CONVERTED",
  "LOST",
];
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const opt = (s) => s.nullable().optional();
const text = (max) =>
  opt(
    z
      .string()
      .trim()
      .max(max)
      .transform((v) => (v === "" ? null : v)),
  );

const fields = {
  firstName: text(80),
  lastName: text(80),
  fullName: text(160),
  email: opt(
    z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254)
      .or(z.literal("").transform(() => null)),
  ),
  phone: text(40),
  companyName: text(160),
  companyId: opt(z.string().uuid()),
  designation: text(120),
  website: text(300),
  countryCode: opt(countryField),
  region: text(120),
  city: text(120),
  timezone: opt(timezoneField),
  locale: text(20),
  source: text(80),
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  score: opt(z.coerce.number().int().min(0).max(100)),
  description: text(5000),
  customFields: opt(z.record(z.string(), z.any())),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  // Sales follow-up
  responseStatus: text(60),
  callStatus: text(60),
  callNotes: text(5000),
  previousPitch: text(2000),
  followUpPitch: text(2000),
  priceCurrency: opt(currencyField),
  basicPrice: opt(amountField),
  premiumPrice: opt(amountField),
  dataCount: opt(z.coerce.number().int().min(0).max(2_000_000_000)),
};

export const createSchema = z
  .object({
    ...fields,
    ownerWorkspaceId: z.string().uuid().optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .strict()
  .refine(
    (d) => d.fullName || d.firstName || d.lastName || d.email || d.companyName,
    "Enter a name, email or company.",
  );

export const updateSchema = z
  .object({ ...fields, allowDuplicate: z.boolean().optional() })
  .strict();

export const bulkPatchSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    source: text(80),
    tags: fields.tags,
    responseStatus: fields.responseStatus,
    callStatus: fields.callStatus,
  })
  .strict();

export const listQuery = listQuerySchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  source: z.string().max(80).optional(),
  countryCode: countryField.optional(),
  tag: z.string().max(40).optional(),
  responseStatus: z.string().max(60).optional(),
  callStatus: z.string().max(60).optional(),
  ownerWorkspaceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  layout: z.enum(["client", "detailed"]).default("client"), // export column layout
});

export const convertSchema = z
  .object({
    createCompany: z.boolean().default(true),
    deal: z
      .object({
        title: z.string().trim().min(1).max(200),
        amount: amountField.optional(),
        currency: currencyField.optional(),
        expectedCloseDate: z.coerce.date().optional(),
      })
      .optional(),
  })
  .strict();

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

export const importQuery = z.object({
  ownerWorkspaceId: z.string().uuid().optional(), // for rows without a Sales ID column
  source: z.string().max(80).optional(),
  updateExisting: flag,
  createMissingSalesIds: flag,
  priceCurrency: currencyField.default("USD"), // currency of the package price columns
});

export const templateQuery = z.object({
  format: z.enum(["csv", "xlsx"]).default("xlsx"),
});

const statusList = z
  .array(z.string().trim().min(1).max(60))
  .max(60)
  .transform((a) => [...new Set(a)]);
export const optionsSchema = z
  .object({
    responseStatuses: statusList.optional(),
    callStatuses: statusList.optional(),
  })
  .strict();

export const audienceSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(10000).optional(),
    all: z.boolean().optional(),
    query: z.record(z.string(), z.any()).optional(),
    listName: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((d) => d.ids?.length || d.all, "Select at least one lead.");
