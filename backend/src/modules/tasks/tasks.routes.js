import { Router } from 'express';
import * as c from './tasks.controller.js';
import * as v from './tasks.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { salesScope } from '../../middleware/salesIdMiddleware.js';

const router = Router();
router.use(requireAuth, salesScope);
router.get('/', validate({ query: v.listQuery }), c.list);
router.post('/', validate({ body: v.createSchema }), c.create);
router.post('/bulk-status', validate({ body: v.bulkSchema }), c.bulk);
router.get('/:id', validate({ params: v.idParams }), c.get);
router.put('/:id', validate({ params: v.idParams, body: v.updateSchema }), c.update);
router.post('/:id/complete', validate({ params: v.idParams }), c.complete);
router.delete('/:id', validate({ params: v.idParams }), c.remove);
export default router;
