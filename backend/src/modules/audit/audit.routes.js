import { Router } from 'express';
import * as c from './audit.controller.js';
import { listSchema } from './audit.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { salesScope } from '../../middleware/salesIdMiddleware.js';

const router = Router();
router.get('/', requireAuth, salesScope, validate({ query: listSchema }), c.list);
export default router;
