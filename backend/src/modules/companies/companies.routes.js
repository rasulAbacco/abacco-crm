import c from './companies.controller.js';
import * as v from './companies.validator.js';
import { buildRecordRouter } from '../../services/records/recordRouter.js';

export default buildRecordRouter(c, v);
