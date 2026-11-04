import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { countryField, timezoneField } from '../../utils/intl.js';
import { amountField, currencyField } from '../../utils/money.js';

const opt = (s) => s.nullable().optional();
export const idParams = z.object({ id: z.string().uuid() });

const segment = z
  .object({ countryCodes: z.array(countryField).max(100).optional(), tags: z.array(z.string().max(40)).max(20).optional(), excludeTags: z.array(z.string().max(40)).max(20).optional() })
  .strict();

const fields = {
  name: z.string().trim().min(1).max(160),
  description: opt(z.string().trim().max(1000)),
  subject: opt(z.string().trim().max(250)),
  preheader: opt(z.string().trim().max(250)),
  fromName: opt(z.string().trim().max(120)),
  replyTo: opt(z.string().trim().toLowerCase().email().or(z.literal('').transform(() => null))),
  templateId: opt(z.string().uuid()),
  html: opt(z.string().max(500000)),
  text: opt(z.string().max(200000)),
  listIds: z.array(z.string().uuid()).max(50).optional(),
  smtpAccountIds: z.array(z.string().uuid()).max(20).optional(),
  segmentFilter: opt(segment),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
  scheduleMode: z.enum(['IMMEDIATE', 'FIXED_TIME', 'RECIPIENT_LOCAL']).optional(),
  scheduledAt: opt(z.coerce.date()),
  localSendDate: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  localSendTime: opt(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
  fallbackTimezone: opt(timezoneField),
  pastTimeBehaviour: z.enum(['SEND_NOW', 'NEXT_DAY', 'SKIP']).optional(),
  respectBusinessHours: z.boolean().optional(),
  pitchAmount: opt(amountField),
  pitchCurrency: opt(currencyField),
  pitchPriceNote: opt(z.string().trim().max(500)),
};

export const createSchema = z.object({ ...fields, ownerWorkspaceId: z.string().uuid().optional() }).strict();
export const updateSchema = z.object({ ...fields, name: fields.name.optional() }).strict();
export const listQuery = listQuerySchema.extend({ status: z.string().max(120).optional(), ownerWorkspaceId: z.string().uuid().optional() });
export const recipientsQuery = listQuerySchema.extend({ status: z.enum(['PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'SUPPRESSED', 'UNSUBSCRIBED', 'SKIPPED', 'CANCELLED']).optional() });
export const testSchema = z.object({ to: z.array(z.string().trim().email()).min(1).max(5), smtpAccountId: z.string().uuid().optional() }).strict();
