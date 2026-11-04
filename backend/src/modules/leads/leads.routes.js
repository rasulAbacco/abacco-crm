import c from './leads.controller.js';
import * as v from './leads.validator.js';
import { buildRecordRouter, idParams } from '../../services/records/recordRouter.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { singleFile } from '../../middleware/uploadMiddleware.js';

export default buildRecordRouter(c, v, (router) => {
  router.post('/import', singleFile, validate({ query: v.importQuery }), c.importFile);
  router.post('/:id/convert', validate({ params: idParams, body: v.convertSchema }), c.convert);
});
