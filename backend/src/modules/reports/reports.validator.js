import { z } from 'zod';
export const rangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), source: z.string().max(80).optional(), campaignId: z.string().uuid().optional(), unit: z.enum(['day', 'week', 'month']).default('day') });
export const exportQuery = rangeQuery.extend({ report: z.enum(['sales-ids', 'campaigns', 'leads-by-source', 'smtp']), format: z.enum(['csv', 'xlsx']).default('csv') });
