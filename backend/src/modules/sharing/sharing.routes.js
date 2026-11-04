import { Router } from 'express';
import * as c from './sharing.controller.js';
import * as v from './sharing.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { salesScope } from '../../middleware/salesIdMiddleware.js';

// Mounted at /api/v1/records/:entity (entity = leads | contacts | companies | deals).
// The Phase 4 modules also expose these as /api/v1/leads/:id/share etc.
const router = Router({ mergeParams: true });
router.use(requireAuth, salesScope);

router.post('/:entity/bulk-share', validate({ params: v.entityParams, body: v.bulkShareSchema }), c.bulkShare);
router.post('/:entity/bulk-transfer', validate({ params: v.entityParams, body: v.bulkTransferSchema }), c.bulkTransfer);
router.get('/:entity/:id/shares', validate({ params: v.recordParams }), c.listShares);
router.post('/:entity/:id/shares', validate({ params: v.recordParams, body: v.shareSchema }), c.share);
router.patch('/:entity/:id/shares/:targetWorkspaceId', validate({ params: v.shareTargetParams, body: v.updateShareSchema }), c.updateShare);
router.delete('/:entity/:id/shares/:targetWorkspaceId', validate({ params: v.shareTargetParams }), c.revoke);
router.post('/:entity/:id/transfer', validate({ params: v.recordParams, body: v.transferSchema }), c.transfer);
router.get('/:entity/:id/transfers', validate({ params: v.recordParams }), c.transfers);

export default router;
