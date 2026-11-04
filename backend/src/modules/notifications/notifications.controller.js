import * as s from './notifications.service.js';
import { ok } from '../../utils/apiResponse.js';
export const list = async (req, res) => ok(res, await s.listNotifications(req.user.id, req.valid.query));
export const read = async (req, res) => { await s.markRead(req.user.id, req.valid.params.id); return ok(res, { read: true }); };
export const readAll = async (req, res) => { await s.markAllRead(req.user.id); return ok(res, { read: true }); };
