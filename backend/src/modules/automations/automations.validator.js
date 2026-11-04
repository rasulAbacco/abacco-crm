import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';

export const idParams = z.object({ id: z.string().uuid() });
const step = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SEND_EMAIL'), config: z.object({ subject: z.string().trim().min(1).max(250), html: z.string().min(1).max(300000), fromName: z.string().max(120).optional() }).strict() }),
  z.object({ type: z.literal('WAIT'), config: z.object({ amount: z.coerce.number().int().min(1).max(365), unit: z.enum(['minutes', 'hours', 'days']) }).strict() }),
  z.object({ type: z.literal('CREATE_TASK'), config: z.object({ title: z.string().trim().min(1).max(200), dueInDays: z.coerce.number().int().min(0).max(365).default(1), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM') }).strict() }),
  z.object({ type: z.literal('UPDATE_FIELD'), config: z.object({ field: z.enum(['status', 'priority']), value: z.string().max(40) }).strict() }),
]);
const trigger = z.enum(['LEAD_CREATED', 'CONTACT_CREATED', 'LIST_JOINED', 'LEAD_STATUS_CHANGED', 'MANUAL']);
const triggerConfig = z.object({ listId: z.string().uuid().optional(), status: z.string().max(40).optional(), source: z.string().max(80).optional() }).strict().nullable().optional();

export const createSchema = z
  .object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).nullable().optional(), triggerType: trigger, triggerConfig, smtpAccountId: z.string().uuid().nullable().optional(), allowReentry: z.boolean().optional(), steps: z.array(step).max(30).default([]), ownerWorkspaceId: z.string().uuid().optional() })
  .strict()
  .refine((d) => d.triggerType !== 'LIST_JOINED' || d.triggerConfig?.listId, { message: 'Choose the list that starts this automation.', path: ['triggerConfig'] });
export const updateSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(500).nullable().optional(), triggerType: trigger.optional(), triggerConfig, smtpAccountId: z.string().uuid().nullable().optional(), allowReentry: z.boolean().optional(), steps: z.array(step).max(30).optional() }).strict();
export const enrollSchema = z.object({ contactIds: z.array(z.string().uuid()).max(2000).optional(), leadIds: z.array(z.string().uuid()).max(2000).optional() }).strict();
export const listQuery = listQuerySchema;
export const logQuery = listQuerySchema.extend({ status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED']).optional() });
