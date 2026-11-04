import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
export const passwordRule = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letters and at least one number.');

const timezone = z.string().refine((tz) => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Unknown IANA timezone.');

export const setupSchema = z.object({
  setupToken: z.string().min(1),
  accountName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(120),
  email,
  password: passwordRule,
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordRule });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordRule });
export const logoutSchema = z.object({ allSessions: z.boolean().optional() });
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    timezone: timezone.nullable().optional(),
    locale: z.string().trim().min(2).max(20).nullable().optional(),
  })
  .strict();

export { timezone as timezoneSchema };
