import { z } from 'zod';

const parent = { entityType: z.enum(['LEAD', 'CONTACT', 'COMPANY', 'DEAL']), entityId: z.string().uuid() };
export const noteCreate = z.object({ ...parent, body: z.string().trim().min(1).max(10000) }).strict();
export const noteUpdate = z.object({ body: z.string().trim().min(1).max(10000) }).strict();
export const activityCreate = z
  .object({ ...parent, type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE']), subject: z.string().trim().min(1).max(200), body: z.string().trim().max(10000).optional(), occurredAt: z.coerce.date().optional() })
  .strict();
export const idParams = z.object({ id: z.string().uuid() });
