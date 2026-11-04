import * as s from './reports.service.js';
import { ok } from '../../utils/apiResponse.js';
import { sendTable } from '../../services/files/tabularService.js';
export const sales = async (req, res) => ok(res, await s.sales(req.scope, req.valid.query));
export const email = async (req, res) => ok(res, await s.email(req.scope, req.valid.query));
export const comparison = async (req, res) => ok(res, await s.comparison(req.scope, req.valid.query));
export const trends = async (req, res) => ok(res, await s.trends(req.scope, req.valid.query));
export const exportFile = async (req, res) => {
  const q = req.valid.query;
  const { rows, columns } = await s.exportRows(req.scope, q);
  return sendTable(res, { format: q.format, filename: `report-${q.report}-${new Date().toISOString().slice(0, 10)}`, rows, columns });
};
