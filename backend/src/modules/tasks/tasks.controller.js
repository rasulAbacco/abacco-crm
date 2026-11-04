import * as s from './tasks.service.js';
import { ok, created, paginated } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

export const list = async (req, res) => {
  const q = req.valid.query;
  const { items, total } = await s.listTasks(req.scope, q, req.user.timezone ?? 'Asia/Kolkata');
  return paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
};
export const get = async (req, res) => ok(res, await s.getTask(req.scope, req.valid.params.id));
export const create = async (req, res) => created(res, await s.createTask(req.scope, req.valid.body, requestContext(req)));
export const update = async (req, res) => ok(res, await s.updateTask(req.scope, req.valid.params.id, req.valid.body, requestContext(req)));
export const complete = async (req, res) => ok(res, await s.updateTask(req.scope, req.valid.params.id, { status: 'DONE' }, requestContext(req)));
export const remove = async (req, res) => ok(res, await s.deleteTask(req.scope, req.valid.params.id, requestContext(req)));
export const bulk = async (req, res) => ok(res, await s.bulkStatus(req.scope, req.valid.body.ids, req.valid.body.status, requestContext(req)));
