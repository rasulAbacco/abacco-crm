import { Router } from 'express';
import * as c from './account.controller.js';
import * as v from './account.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', c.get);
router.put('/', validate({ body: v.updateAccountSchema }), c.update);
router.get('/countries', c.countries);
router.put('/countries/:code', validate({ params: v.countryParams, body: v.countrySchema }), c.upsertCountry);
router.delete('/countries/:code', validate({ params: v.countryParams }), c.deleteCountry);

export default router;
