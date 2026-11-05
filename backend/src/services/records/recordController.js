// HTTP handlers shared by the lead / contact / company / deal modules.
import { ok, created, paginated } from "../../utils/apiResponse.js";
import { requestContext } from "../audit/auditService.js";
import { sendTable } from "../files/tabularService.js";
import * as sharing from "../../modules/sharing/sharing.service.js";

export function createRecordController(
  service,
  { filterWhere = () => ({}), exportColumns, exportName },
) {
  /** "Select all N matching" → ids of every record matching the list filters (max 10,000). */
  async function matchingIds(scope, rawQuery, listQuery) {
    const { page, pageSize, ...rest } = rawQuery ?? {};
    const q = listQuery.parse(rest);
    const rows = await service.exportRows(scope, q, filterWhere(q), 10000);
    return rows.map((r) => r.id);
  }
  return {
    matchingIds,
    list: async (req, res) => {
      const q = req.valid.query;
      const { items, total } = await service.list(req.scope, q, filterWhere(q));
      return paginated(res, items, {
        page: q.page,
        pageSize: q.pageSize,
        total,
      });
    },
    get: async (req, res) =>
      ok(res, await service.get(req.scope, req.valid.params.id)),
    create: async (req, res) =>
      created(
        res,
        await service.create(req.scope, req.valid.body, requestContext(req)),
      ),
    update: async (req, res) =>
      ok(
        res,
        await service.update(
          req.scope,
          req.valid.params.id,
          req.valid.body,
          requestContext(req),
        ),
      ),
    remove: async (req, res) =>
      ok(
        res,
        await service.remove(
          req.scope,
          req.valid.params.id,
          requestContext(req),
        ),
      ),
    bulkDelete: async (req, res) =>
      ok(
        res,
        await service.bulkDelete(
          req.scope,
          req.valid.body.ids,
          requestContext(req),
        ),
      ),
    bulkUpdate: async (req, res) =>
      ok(
        res,
        await service.bulkUpdate(
          req.scope,
          req.valid.body.ids,
          req.valid.body.patch,
          requestContext(req),
        ),
      ),
    timeline: async (req, res) =>
      ok(res, await service.timeline(req.scope, req.valid.params.id)),
    exportFile: async (req, res) => {
      const q = req.valid.query;
      const rows = await service.exportRows(req.scope, q, filterWhere(q));
      return sendTable(res, {
        format: q.format,
        filename: `${exportName}-${new Date().toISOString().slice(0, 10)}`,
        columns: exportColumns,
        rows,
      });
    },
    share: async (req, res) =>
      ok(
        res,
        await sharing.shareRecord(
          req.scope,
          service.entityType,
          req.valid.params.id,
          req.valid.body,
          requestContext(req),
        ),
      ),
    transfer: async (req, res) =>
      ok(
        res,
        await sharing.transferRecord(
          req.scope,
          service.entityType,
          req.valid.params.id,
          req.valid.body,
          requestContext(req),
        ),
      ),
  };
}
