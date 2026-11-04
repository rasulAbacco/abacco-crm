import { z } from 'zod';
import { timezoneSchema } from '../auth/auth.validator.js';
import { currencySchema } from '../sales-ids/salesId.validator.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour).');

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    defaultCurrency: currencySchema.optional(),
    defaultTimezone: timezoneSchema.optional(),
    defaultLocale: z.string().trim().min(2).max(20).optional(),
    legalName: z.string().trim().max(200).nullable().optional(),
    postalAddress: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update.');

export const countryParams = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a 2-letter ISO 3166-1 country code.'),
});

export const countrySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    defaultTimezone: timezoneSchema,
    legalRegime: z.enum(['GDPR', 'UK_GDPR', 'CASL', 'CAN_SPAM', 'DPDP', 'SPAM_ACT', 'OTHER']),
    requiresPriorConsent: z.boolean(),
    businessHoursStart: hhmm.default('09:00'),
    businessHoursEnd: hhmm.default('18:00'),
    businessDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5]),
    currency: currencySchema.nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((d) => d.businessHoursStart < d.businessHoursEnd, { message: 'Business hours must end after they start.', path: ['businessHoursEnd'] });
