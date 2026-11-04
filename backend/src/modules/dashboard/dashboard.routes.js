import { Router } from 'express';
import * as c from './dashboard.controller.js';
import { dashboardQuery } from './dashboard.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { salesScope } from '../../middleware/salesIdMiddleware.js';
const router = Router();
router.get('/', requireAuth, salesScope, validate({ query: dashboardQuery }), c.get);
export default router;
