import * as service from './account.service.js';
import { ok, noContent } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';

export const get = async (req, res) => ok(res, await service.getAccount(req.accountId));
export const update = async (req, res) => ok(res, await service.updateAccount(req.accountId, req.valid.body, requestContext(req)));
export const countries = async (req, res) => ok(res, await service.listCountries(req.accountId));
export const upsertCountry = async (req, res) =>
  ok(res, await service.upsertCountry(req.accountId, req.valid.params.code, req.valid.body, requestContext(req)));
export const deleteCountry = async (req, res) => {
  await service.deleteCountry(req.accountId, req.valid.params.code, requestContext(req));
  return noContent(res);
};
