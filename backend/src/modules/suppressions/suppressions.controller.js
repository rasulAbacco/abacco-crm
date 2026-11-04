import * as s from './suppressions.service.js';
import { ok, paginated } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';
export const list = async (req, res) => { const q = req.valid.query; const r = await s.list(req.accountId, q); res.set('X-Summary', JSON.stringify(r.summary)); return paginated(res, r.items, { ...q, total: r.total }); };
export const summary = async (req, res) => ok(res, (await s.list(req.accountId, { page: 1, pageSize: 1 })).summary);
export const add = async (req, res) => ok(res, await s.add(req.accountId, req.valid.body, requestContext(req)));
export const remove = async (req, res) => ok(res, await s.remove(req.accountId, req.valid.params.id, requestContext(req)));
export const unsubscribes = async (req, res) => { const q = req.valid.query; const r = await s.unsubscribes(req.accountId, q); return paginated(res, r.items, { ...q, total: r.total }); };
