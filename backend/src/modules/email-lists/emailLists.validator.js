import { z } from 'zod';
import { listQuerySchema } from '../../utils/pagination.js';
import { countryField } from '../../utils/intl.js';

export const idParams = z.object({ id: z.string().uuid() });
export const createSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).nullable().optional(), ownerWorkspaceId: z.string().uuid().optional() }).strict();
export const updateSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(500).nullable().optional() }).strict();
export const listQuery = listQuerySchema.extend({ ownerWorkspaceId: z.string().uuid().optional() });
export const membersQuery = listQuerySchema.extend({ status: z.enum(['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'REMOVED']).optional(), countryCode: countryField.optional() });
export const addMembersSchema = z
  .object({
    contactIds: z.array(z.string().uuid()).max(5000).optional(),
    emails: z.array(z.object({ email: z.string().trim().toLowerCase().email(), firstName: z.string().max(80).optional(), lastName: z.string().max(80).optional(), countryCode: countryField.optional() })).max(5000).optional(),
  })
  .strict();
export const removeMembersSchema = z.object({ contactIds: z.array(z.string().uuid()).min(1).max(5000) }).strict();
export const segmentSchema = z
  .object({ countryCodes: z.array(countryField).max(100).optional(), tags: z.array(z.string().max(40)).max(20).optional(), sources: z.array(z.string().max(80)).max(20).optional(), companyId: z.string().uuid().optional() })
  .strict();
export const exportQuery = z.object({ format: z.enum(['csv', 'xlsx']).default('csv'), status: z.enum(['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'REMOVED']).optional() });
