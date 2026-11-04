import * as service from './salesId.service.js';
import { ok, created, paginated } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

export async function list(req, res) {
  const q = req.valid.query;
  const { items, total } = await service.listWorkspaces(req.accountId, q);
  return paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
}

export async function options(req, res) {
  return ok(res, await service.switcherOptions(req.accountId));
}

export async function get(req, res) {
  return ok(res, await service.getWorkspace(req.accountId, req.valid.params.id));
}

export async function create(req, res) {
  return created(res, await service.createWorkspace(req.accountId, req.valid.body, requestContext(req)));
}

export async function update(req, res) {
  return ok(res, await service.updateWorkspace(req.accountId, req.valid.params.id, req.valid.body, requestContext(req)));
}

export async function setStatus(req, res) {
  return ok(res, await service.setStatus(req.accountId, req.valid.params.id, req.valid.body.status, requestContext(req)));
}

export async function setDefault(req, res) {
  return ok(res, await service.setDefault(req.accountId, req.valid.params.id, requestContext(req)));
}

export async function remove(req, res) {
  return ok(res, await service.deleteWorkspace(req.accountId, req.valid.params.id, req.valid.body, requestContext(req)));
}
