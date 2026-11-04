import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { amountField, currencyField } from '../../utils/money.js';

const opt = (s) => s.nullable().optional();
const text = (max) => opt(z.string().trim().max(max).transform((v) => (v === '' ? null : v)));

const fields = {
  title: z.string().trim().min(1).max(200),
  amount: amountField.optional(),
  currency: currencyField.optional(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  probability: opt(z.coerce.number().int().min(0).max(100)),
  expectedCloseDate: opt(z.coerce.date()),
  leadId: opt(z.string().uuid()),
  contactId: opt(z.string().uuid()),
  companyId: opt(z.string().uuid()),
  description: text(5000),
  lostReason: text(500),
  customFields: opt(z.record(z.string(), z.any())),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
};

export const createSchema = z.object({ ...fields, ownerWorkspaceId: z.string().uuid().optional() }).strict();
export const updateSchema = z.object({ ...fields, title: fields.title.optional() }).strict();
export const bulkPatchSchema = z.object({ stageId: fields.stageId, tags: fields.tags }).strict();
export const listQuery = listQuerySchema.extend({
  status: z.enum(['OPEN', 'WON', 'LOST']).optional(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  currency: currencyField.optional(),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  tag: z.string().max(40).optional(),
  ownerWorkspaceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const boardQuery = z.object({ pipelineId: z.string().uuid().optional(), q: z.string().max(200).optional() });
export const moveSchema = z.object({ stageId: z.string().uuid(), position: z.number().optional(), lostReason: z.string().max(500).optional() }).strict();

const stageFields = { name: z.string().trim().min(1).max(60), probability: z.coerce.number().int().min(0).max(100).default(0), kind: z.enum(['OPEN', 'WON', 'LOST']).default('OPEN'), color: opt(z.string().regex(/^#[0-9a-fA-F]{6}$/)) };
export const pipelineCreate = z.object({ name: z.string().trim().min(1).max(80), workspaceId: z.string().uuid().optional(), copyDefaultStages: z.boolean().default(true) }).strict();
export const pipelineUpdate = z.object({ name: z.string().trim().min(1).max(80).optional(), isDefault: z.boolean().optional() }).strict();
export const stageCreate = z.object(stageFields).strict();
export const stageUpdate = z.object({ name: stageFields.name.optional(), probability: z.coerce.number().int().min(0).max(100).optional(), kind: z.enum(['OPEN', 'WON', 'LOST']).optional(), color: stageFields.color }).strict();
export const stageOrder = z.object({ stageIds: z.array(z.string().uuid()).min(1).max(30) }).strict();
export const stageDelete = z.object({ moveToStageId: z.string().uuid().optional() }).strict();
export const pipelineParams = z.object({ id: z.string().uuid() });
export const stageParams = z.object({ id: z.string().uuid(), stageId: z.string().uuid() });
export const pipelineListQuery = z.object({ workspaceId: z.string().uuid().optional() });
