import { z } from 'zod';
export const idParams = z.object({ id: z.string().uuid() });
export const updateSchema = z.object({ name: z.string().trim().min(1).max(40).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() }).strict();
