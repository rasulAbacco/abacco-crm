import { Router } from 'express';
import * as c from './salesId.controller.js';
import * as v from './salesId.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

// Sales ID management is account-level: it is not filtered by X-Sales-Id.
const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: v.listSchema }), c.list);
router.get('/options', c.options);
router.post('/', validate({ body: v.createSchema }), c.create);
router.get('/:id', validate({ params: v.idParams }), c.get);
router.put('/:id', validate({ params: v.idParams, body: v.updateSchema }), c.update);
router.patch('/:id/status', validate({ params: v.idParams, body: v.statusSchema }), c.setStatus);
router.post('/:id/default', validate({ params: v.idParams }), c.setDefault);
router.delete('/:id', validate({ params: v.idParams, body: v.deleteSchema }), c.remove);

export default router;
