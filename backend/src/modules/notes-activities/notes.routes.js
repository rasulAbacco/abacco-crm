import { Router } from 'express';
import * as c from './notes.controller.js';
import * as v from './notes.validator.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { salesScope } from '../../middleware/salesIdMiddleware.js';

export const noteRoutes = Router();
noteRoutes.use(requireAuth, salesScope);
noteRoutes.post('/', validate({ body: v.noteCreate }), c.createNote);
noteRoutes.put('/:id', validate({ params: v.idParams, body: v.noteUpdate }), c.updateNote);
noteRoutes.delete('/:id', validate({ params: v.idParams }), c.deleteNote);

export const activityRoutes = Router();
activityRoutes.use(requireAuth, salesScope);
activityRoutes.get('/recent', c.recent);
activityRoutes.post('/', validate({ body: v.activityCreate }), c.logActivity);
