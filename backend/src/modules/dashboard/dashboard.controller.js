import { dashboard } from './dashboard.service.js';
import { ok } from '../../utils/apiResponse.js';
export const get = async (req, res) => ok(res, await dashboard(req.scope, req.valid.query));
