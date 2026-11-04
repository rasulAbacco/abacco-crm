import * as s from './smtpAccounts.service.js';
import { ok, created } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

export const providers = (_req, res) => ok(res, s.providers());
export const list = async (req, res) => ok(res, await s.list(req.scope));
export const get = async (req, res) => ok(res, await s.get(req.accountId, req.valid.params.id));
export const create = async (req, res) => created(res, await s.create(req.accountId, req.valid.body, requestContext(req)));
export const update = async (req, res) => ok(res, await s.update(req.accountId, req.valid.params.id, req.valid.body, requestContext(req)));
export const assign = async (req, res) => ok(res, await s.update(req.accountId, req.valid.params.id, { workspaceIds: req.valid.body.workspaceIds }, requestContext(req)));
export const remove = async (req, res) => ok(res, await s.remove(req.accountId, req.valid.params.id, requestContext(req)));
export const test = async (req, res) => ok(res, await s.test(req.accountId, req.valid.params.id, req.valid.body, requestContext(req)));
export const logs = async (req, res) => ok(res, await s.logs(req.accountId, req.valid.params.id));
