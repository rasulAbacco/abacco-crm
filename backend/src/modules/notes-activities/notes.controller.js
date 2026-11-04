import * as s from './notes.service.js';
import { ok, created } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

export const createNote = async (req, res) => created(res, await s.createNote(req.scope, req.valid.body, requestContext(req)));
export const updateNote = async (req, res) => ok(res, await s.updateNote(req.scope, req.valid.params.id, req.valid.body, requestContext(req)));
export const deleteNote = async (req, res) => ok(res, await s.deleteNote(req.scope, req.valid.params.id, requestContext(req)));
export const logActivity = async (req, res) => created(res, await s.logActivity(req.scope, req.valid.body, requestContext(req)));
export const recent = async (req, res) => ok(res, await s.recentActivities(req.scope, 30));
