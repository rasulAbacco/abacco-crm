import * as s from './tags.service.js';
import { ok } from '../../utils/apiResponse.js';
export const list = async (req, res) => ok(res, await s.listTags(req.accountId));
export const update = async (req, res) => ok(res, await s.updateTag(req.accountId, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => ok(res, await s.deleteTag(req.accountId, req.valid.params.id));
