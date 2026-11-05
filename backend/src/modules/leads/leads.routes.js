import c from "./leads.controller.js";
import * as v from "./leads.validator.js";
import {
  buildRecordRouter,
  idParams,
} from "../../services/records/recordRouter.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { singleFile } from "../../middleware/uploadMiddleware.js";

export default buildRecordRouter(c, v, (router) => {
  router.get("/options", c.options);
  router.put("/options", validate({ body: v.optionsSchema }), c.updateOptions);
  router.get(
    "/import-template",
    validate({ query: v.templateQuery }),
    c.template,
  );
  router.post(
    "/import",
    singleFile,
    validate({ query: v.importQuery }),
    c.importFile,
  );
  router.post(
    "/email-audience",
    validate({ body: v.audienceSchema }),
    c.emailAudience,
  );
  router.post(
    "/:id/convert",
    validate({ params: idParams, body: v.convertSchema }),
    c.convert,
  );
});
