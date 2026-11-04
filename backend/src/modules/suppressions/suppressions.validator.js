import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
export const listQuery = listQuerySchema.extend({ reason: z.enum(['HARD_BOUNCE', 'COMPLAINT', 'UNSUBSCRIBED', 'MANUAL', 'ERASURE', 'INVALID']).optional() });
export const addSchema = z.object({ emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(5000), note: z.string().max(300).optional() }).strict();
export const idParams = z.object({ id: z.string().uuid() });
