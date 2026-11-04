import { listAuditLogs } from './audit.service.js';
import { paginated } from '../../utils/apiResponse.js';

export async function list(req, res) {
  const q = req.valid.query;
  const { items, total } = await listAuditLogs(req.scope, q);
  return paginated(res, items, { page: q.page, pageSize: q.pageSize, total });
}
