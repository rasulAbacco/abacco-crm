import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
export const idParams = z.object({ id: z.string().uuid() });
const fields = { name: z.string().trim().min(1).max(120), subject: z.string().trim().max(250).nullable().optional(), preheader: z.string().trim().max(250).nullable().optional(), html: z.string().min(1).max(500000), text: z.string().max(200000).nullable().optional(), design: z.any().optional() };
export const createSchema = z.object({ ...fields, ownerWorkspaceId: z.string().uuid().nullable().optional(), shared: z.boolean().optional() }).strict();
export const updateSchema = z.object({ ...fields, name: fields.name.optional(), html: fields.html.optional() }).strict();
export const listQuery = listQuerySchema;
export const previewSchema = z.object({ html: z.string().max(500000).optional(), subject: z.string().max(250).optional(), contactId: z.string().uuid().optional() }).strict();
