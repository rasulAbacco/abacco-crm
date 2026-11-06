// "CC Mail" addresses on leads and contacts: typed as "a@x.com, b@y.com" (comma,
// semicolon or new line) or sent as an array. Stored lower-case, de-duplicated.
import { z } from "zod";

export const MAX_CC = 5;
const EMAIL = z.string().email();

export function splitEmails(value) {
  if (value === null || value === undefined) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[,;\n]+/);
  return [
    ...new Set(
      parts.map((e) => String(e).trim().toLowerCase()).filter(Boolean),
    ),
  ];
}

/** Returns { emails, invalid } so imports can report bad addresses per row. */
export function parseCcEmails(value) {
  const all = splitEmails(value);
  const invalid = all.filter((e) => !EMAIL.safeParse(e).success);
  return {
    emails: all.filter((e) => !invalid.includes(e)).slice(0, MAX_CC),
    invalid,
    tooMany: all.length - invalid.length > MAX_CC,
  };
}

export const ccEmailsField = z
  .union([z.string().max(1000), z.array(z.string().max(254)).max(20)])
  .nullable()
  .transform((v, ctx) => {
    const { emails, invalid, tooMany } = parseCcEmails(v);
    if (invalid.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Not a valid email: ${invalid.join(", ")}`,
      });
    if (tooMany)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Up to ${MAX_CC} CC addresses.`,
      });
    return emails;
  });
