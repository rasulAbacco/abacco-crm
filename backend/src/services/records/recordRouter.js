// Standard REST surface for a shareable record module. Module-specific routes
// (import, convert, stage moves…) are added by the module's own routes file.
import { Router } from "express";
import { z } from "zod";
import { validate } from "../../middleware/validationMiddleware.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { salesScope } from "../../middleware/salesIdMiddleware.js";
import {
  shareSchema,
  transferSchema,
} from "../../modules/sharing/sharing.validator.js";

export const idParams = z.object({ id: z.string().uuid() });
const ids = z.array(z.string().uuid()).min(1).max(10000);
// Bulk actions accept explicit ids, or { all: true, query } = every record matching the list filters.
const target = {
  ids: ids.optional(),
  all: z.boolean().optional(),
  query: z.record(z.string(), z.any()).optional(),
};
const hasTarget = (d) => d.ids?.length || d.all;

function expandAll(c, listQuery) {
  return async (req, _res, next) => {
    try {
      const b = req.valid.body;
      if (b.all)
        b.ids = await c.matchingIds(req.scope, b.query ?? {}, listQuery);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function buildRecordRouter(c, v, extend) {
  const router = Router();
  router.use(requireAuth, salesScope);
  const exportQuery = v.listQuery.extend({
    format: z.enum(["csv", "xlsx"]).default("csv"),
  });

  router.get("/", validate({ query: v.listQuery }), c.list);
  router.get("/export", validate({ query: exportQuery }), c.exportFile);
  router.post("/", validate({ body: v.createSchema }), c.create);
  router.post(
    "/bulk-delete",
    validate({
      body: z.object(target).refine(hasTarget, "Select at least one record."),
    }),
    expandAll(c, v.listQuery),
    c.bulkDelete,
  );
  router.post(
    "/bulk-update",
    validate({
      body: z
        .object({ ...target, patch: v.bulkPatchSchema })
        .refine(hasTarget, "Select at least one record."),
    }),
    expandAll(c, v.listQuery),
    c.bulkUpdate,
  );
  if (extend) extend(router);
  router.get("/:id", validate({ params: idParams }), c.get);
  router.get("/:id/timeline", validate({ params: idParams }), c.timeline);
  router.put(
    "/:id",
    validate({ params: idParams, body: v.updateSchema }),
    c.update,
  );
  router.delete("/:id", validate({ params: idParams }), c.remove);
  router.post(
    "/:id/share",
    validate({ params: idParams, body: shareSchema }),
    c.share,
  );
  router.post(
    "/:id/transfer",
    validate({ params: idParams, body: transferSchema }),
    c.transfer,
  );
  return router;
}
