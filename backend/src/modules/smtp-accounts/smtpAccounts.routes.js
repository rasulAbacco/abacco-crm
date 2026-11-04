import { Router } from 'express';
import * as c from './smtpAccounts.controller.js';
import * as v from './smtpAccounts.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { salesScope } from '../../middleware/salesIdMiddleware.js';

const router = Router();
router.use(requireAuth, salesScope);
router.get('/providers', c.providers);
router.get('/', c.list);
router.post('/', validate({ body: v.createSchema }), c.create);
router.get('/:id', validate({ params: v.idParams }), c.get);
router.put('/:id', validate({ params: v.idParams, body: v.updateSchema }), c.update);
router.put('/:id/workspaces', validate({ params: v.idParams, body: v.assignSchema }), c.assign);
router.delete('/:id', validate({ params: v.idParams }), c.remove);
router.post('/:id/test', validate({ params: v.idParams, body: v.testSchema }), c.test);
router.get('/:id/logs', validate({ params: v.idParams }), c.logs);
export default router;
