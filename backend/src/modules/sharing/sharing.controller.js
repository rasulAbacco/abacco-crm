import * as service from './sharing.service.js';
import { ok } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

export async function listShares(req, res) {
  const { entity, id } = req.valid.params;
  return ok(res, await service.listShares(req.scope, entity, id));
}

export async function share(req, res) {
  const { entity, id } = req.valid.params;
  return ok(res, await service.shareRecord(req.scope, entity, id, req.valid.body, requestContext(req)));
}

export async function updateShare(req, res) {
  const { entity, id, targetWorkspaceId } = req.valid.params;
  const [result] = await service.shareRecord(
    req.scope,
    entity,
    id,
    { targetWorkspaceIds: [targetWorkspaceId], permission: req.valid.body.permission },
    requestContext(req),
  );
  return ok(res, result);
}

export async function revoke(req, res) {
  const { entity, id, targetWorkspaceId } = req.valid.params;
  return ok(res, await service.revokeShare(req.scope, entity, id, targetWorkspaceId, requestContext(req)));
}

export async function transfer(req, res) {
  const { entity, id } = req.valid.params;
  return ok(res, await service.transferRecord(req.scope, entity, id, req.valid.body, requestContext(req)));
}

export async function transfers(req, res) {
  const { entity, id } = req.valid.params;
  return ok(res, await service.transferHistory(req.scope, entity, id));
}

export async function bulkShare(req, res) {
  const { ids, ...input } = req.valid.body;
  return ok(res, await service.bulk(req.scope, req.valid.params.entity, ids, 'share', input, requestContext(req)));
}

export async function bulkTransfer(req, res) {
  const { ids, ...input } = req.valid.body;
  return ok(res, await service.bulk(req.scope, req.valid.params.entity, ids, 'transfer', input, requestContext(req)));
}
