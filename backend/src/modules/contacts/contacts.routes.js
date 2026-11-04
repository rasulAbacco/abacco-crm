import c from './contacts.controller.js';
import * as v from './contacts.validator.js';
import { buildRecordRouter, idParams } from '../../services/records/recordRouter.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { singleFile } from '../../middleware/uploadMiddleware.js';

export default buildRecordRouter(c, v, (router) => {
  router.post('/import', singleFile, validate({ query: v.importQuery }), c.importFile);
  router.post('/:id/consent', validate({ params: idParams, body: v.consentSchema }), c.consent);
  router.post('/:id/erase', validate({ params: idParams }), c.erase);
});
