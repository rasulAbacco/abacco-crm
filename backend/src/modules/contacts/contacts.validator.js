import { z } from "zod";
import { listQuerySchema } from "../../utils/pagination.js";
import { countryField, timezoneField } from "../../utils/intl.js";
import { ccEmailsField } from "../../utils/ccEmails.js";

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
  ccEmails: ccEmailsField.optional(),
  companyId: opt(z.string().uuid()),
  designation: text(120),
  countryCode: opt(countryField),
  region: text(120),
  city: text(120),
  timezone: opt(timezoneField),
  locale: text(20),
  source: text(80),
  description: text(5000),
  customFields: opt(z.record(z.string(), z.any())),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
};

export const createSchema = z
  .object({
    ...fields,
    ownerWorkspaceId: z.string().uuid().optional(),
    consent: z
      .object({
        legalBasis: z.string().max(60),
        source: z.string().max(60).optional(),
      })
      .optional(),
  })
  .strict()
  .refine(
    (d) => d.firstName || d.lastName || d.email,
    "Enter a name or email.",
  );
export const updateSchema = z.object(fields).strict();
export const bulkPatchSchema = z
  .object({
    companyId: fields.companyId,
    source: fields.source,
    tags: fields.tags,
  })
  .strict();

export const listQuery = listQuerySchema.extend({
  companyId: z.string().uuid().optional(),
  countryCode: countryField.optional(),
  tag: z.string().max(40).optional(),
  listId: z.string().uuid().optional(),
  hasEmail: z.enum(["true", "false"]).optional(),
  ownerWorkspaceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const consentSchema = z
  .object({
    status: z.enum(["GRANTED", "WITHDRAWN"]),
    legalBasis: z.string().trim().max(60).optional(),
    source: z.string().trim().max(60).optional(),
    evidence: z.record(z.string(), z.any()).optional(),
  })
  .strict();

export const importQuery = z.object({
  ownerWorkspaceId: z.string().uuid().optional(),
  listId: z.string().uuid().optional(),
  consentBasis: z.string().max(60).optional(),
  updateExisting: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
