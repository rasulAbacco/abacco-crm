import { z } from 'zod';

// URL segment → entity type
export const ENTITY_SEGMENTS = { leads: 'LEAD', contacts: 'CONTACT', companies: 'COMPANY', deals: 'DEAL' };

const entityParam = z.enum(Object.keys(ENTITY_SEGMENTS)).transform((s) => ENTITY_SEGMENTS[s]);
const permission = z.enum(['READ', 'COLLABORATE']);

export const recordParams = z.object({ entity: entityParam, id: z.string().uuid() });
export const shareTargetParams = recordParams.extend({ targetWorkspaceId: z.string().uuid() });
export const entityParams = z.object({ entity: entityParam });

export const shareSchema = z
  .object({
    targetWorkspaceIds: z.array(z.string().uuid()).min(1).max(50),
    permission: permission.default('READ'),
  })
  .strict();

export const updateShareSchema = z.object({ permission }).strict();

export const transferSchema = z
  .object({
    targetWorkspaceId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
    cascade: z
      .object({ tasks: z.boolean().optional(), deals: z.boolean().optional(), contacts: z.boolean().optional() })
      .strict()
      .optional(),
    // Keep the old Sales ID's access after the move.
    shareBack: permission.optional(),
  })
  .strict();

const ids = z.array(z.string().uuid()).min(1).max(200);
export const bulkShareSchema = shareSchema.extend({ ids });
export const bulkTransferSchema = transferSchema.extend({ ids });
