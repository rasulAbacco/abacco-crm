import { z } from 'zod';
export const dashboardQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), source: z.string().max(80).optional(), campaignId: z.string().uuid().optional() });
