import { z } from 'zod';
export const idParams = z.object({ id: z.string().uuid() });
export const listQuery = z.object({ unreadOnly: z.enum(['true', 'false']).default('false').transform((v) => v === 'true') });
