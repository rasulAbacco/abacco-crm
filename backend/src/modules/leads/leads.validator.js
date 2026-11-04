import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { countryField, timezoneField } from '../../utils/intl.js';
import { amountField, currencyField } from '../../utils/money.js';

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const opt = (s) => s.nullable().optional();
const text = (max) => opt(z.string().trim().max(max).transform((v) => (v === '' ? null : v)));

const fields = {
  firstName: text(80),
  lastName: text(80),
  fullName: text(160),
  email: opt(z.string().trim().toLowerCase().email().max(254).or(z.literal('').transform(() => null))),
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
};

export const createSchema = z
  .object({ ...fields, ownerWorkspaceId: z.string().uuid().optional(), allowDuplicate: z.boolean().optional() })
  .strict()
  .refine((d) => d.fullName || d.firstName || d.lastName || d.email || d.companyName, 'Enter a name, email or company.');

export const updateSchema = z.object({ ...fields, allowDuplicate: z.boolean().optional() }).strict();

export const bulkPatchSchema = z
  .object({ status: z.enum(LEAD_STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), source: text(80), tags: fields.tags })
  .strict();

export const listQuery = listQuerySchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  source: z.string().max(80).optional(),
  countryCode: countryField.optional(),
  tag: z.string().max(40).optional(),
  ownerWorkspaceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const convertSchema = z
  .object({
    createCompany: z.boolean().default(true),
    deal: z
      .object({ title: z.string().trim().min(1).max(200), amount: amountField.optional(), currency: currencyField.optional(), expectedCloseDate: z.coerce.date().optional() })
      .optional(),
  })
  .strict();

export const importQuery = z.object({
  ownerWorkspaceId: z.string().uuid().optional(),
  source: z.string().max(80).optional(),
  updateExisting: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});
