import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';

const opt = (s) => s.nullable().optional();
const fields = {
  title: z.string().trim().min(1).max(200),
  description: opt(z.string().trim().max(5000)),
  type: z.enum(['TODO', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueAt: opt(z.coerce.date()),
  remindAt: opt(z.coerce.date()),
  leadId: opt(z.string().uuid()),
  contactId: opt(z.string().uuid()),
  companyId: opt(z.string().uuid()),
  dealId: opt(z.string().uuid()),
};
export const createSchema = z.object({ ...fields, ownerWorkspaceId: z.string().uuid().optional() }).strict();
export const updateSchema = z.object({ ...fields, title: fields.title.optional() }).strict();
export const idParams = z.object({ id: z.string().uuid() });
export const bulkSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']) }).strict();
export const listQuery = listQuerySchema.extend({
  status: z.string().max(60).optional(), // comma separated
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  type: z.enum(['TODO', 'CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP']).optional(),
  due: z.enum(['overdue', 'today', 'upcoming', 'none']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});
