import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { countryField, timezoneField } from '../../utils/intl.js';

const opt = (s) => s.nullable().optional();
const text = (max) => opt(z.string().trim().max(max).transform((v) => (v === '' ? null : v)));

const fields = {
  name: z.string().trim().min(1).max(200),
  website: text(300),
  industry: text(120),
  size: text(40),
  email: opt(z.string().trim().toLowerCase().email().or(z.literal('').transform(() => null))),
  phone: text(40),
  addressLine1: text(200),
  addressLine2: text(200),
  city: text(120),
  region: text(120),
  postalCode: text(20),
  countryCode: opt(countryField),
  timezone: opt(timezoneField),
  description: text(5000),
  customFields: opt(z.record(z.string(), z.any())),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
};

export const createSchema = z.object({ ...fields, ownerWorkspaceId: z.string().uuid().optional() }).strict();
export const updateSchema = z.object({ ...fields, name: fields.name.optional() }).strict();
export const bulkPatchSchema = z.object({ industry: fields.industry, size: fields.size, tags: fields.tags }).strict();
export const listQuery = listQuerySchema.extend({
  industry: z.string().max(120).optional(),
  countryCode: countryField.optional(),
  tag: z.string().max(40).optional(),
  ownerWorkspaceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
