import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';

export const listSchema = listQuerySchema.extend({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(64).optional(),
  action: z.string().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
