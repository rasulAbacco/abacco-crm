import { z } from "zod";
import { isValidTimezone } from "../../utils/sendSchedule.js";

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, e.g. 09:30.");

const provider = z.enum([
  "GMAIL",
  "REDIFFMAIL",
  "ZOHO",
  "YAHOO",
  "AMAZON_SES",
  "CUSTOM",
]);
const oauth = z
  .object({
    clientId: z.string().min(1).max(300),
    clientSecret: z.string().min(1).max(300),
    refreshToken: z.string().min(1).max(2000),
  })
  .strict();
const base = {
  name: z.string().trim().min(1).max(80),
  fromEmail: z.string().trim().toLowerCase().email(),
  fromName: z.string().trim().max(120).nullable().optional(),
  provider,
  host: z.string().trim().min(3).max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  security: z.enum(["SSL", "STARTTLS", "NONE"]).optional(),
  authType: z.enum(["PASSWORD", "OAUTH2"]).default("PASSWORD"),
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(500).optional(),
  oauth: oauth.optional(),
  hourlyLimit: z.coerce.number().int().min(1).max(100000).optional(),
  dailyLimit: z.coerce.number().int().min(1).max(1000000).optional(),
  isEnabled: z.boolean().optional(),
  // Sending speed (Settings → Sending speed). Emails are spaced 3600 s / hourlyLimit apart.
  pacingEnabled: z.boolean().optional(),
  paceJitterPercent: z.coerce.number().int().min(0).max(50).optional(),
  sendWindowStart: hhmm.nullable().optional(),
  sendWindowEnd: hhmm.nullable().optional(),
  sendDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day.")
    .max(7)
    .transform((d) => [...new Set(d)].sort())
    .optional(),
  sendTimezone: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .optional()
    .refine((tz) => !tz || isValidTimezone(tz), "Unknown timezone."),
  workspaceIds: z.array(z.string().uuid()).max(100).optional(),
};
export const createSchema = z
  .object(base)
  .strict()
  .refine((d) => (d.authType === "OAUTH2" ? !!d.oauth : !!d.password), {
    message: "Enter the password / app password (or OAuth details).",
    path: ["password"],
  });
export const updateSchema = z
  .object(
    Object.fromEntries(
      Object.entries(base).map(([k, v]) => [
        k,
        k === "authType"
          ? z.enum(["PASSWORD", "OAUTH2"]).optional()
          : v.optional(),
      ]),
    ),
  )
  .strict();
export const idParams = z.object({ id: z.string().uuid() });
export const testSchema = z
  .object({ sendTo: z.string().trim().email().optional() })
  .strict();
export const assignSchema = z
  .object({ workspaceIds: z.array(z.string().uuid()).max(100) })
  .strict();
