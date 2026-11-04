import * as s from './deals.service.js';
import { createRecordController } from '../../services/records/recordController.js';
import { ok, created } from '../../utils/apiResponse.js';
import { requestContext } from '../../services/audit/auditService.js';
import { fromMinor } from '../../utils/money.js';

const base = createRecordController(s.dealService, {
  filterWhere: s.dealFilters,
  exportName: 'deals',
  exportColumns: [
    { key: 'title', header: 'Title' }, { key: 'stage', header: 'Stage', value: (r) => r.stage?.name }, { key: 'status', header: 'Status' },
    { key: 'amount', header: 'Amount', value: (r) => fromMinor(r.amountMinor, r.currency) }, { key: 'currency', header: 'Currency' },
    { key: 'probability', header: 'Probability' }, { key: 'expectedCloseDate', header: 'Expected close' }, { key: 'company', header: 'Company', value: (r) => r.company?.name },
    { key: 'contact', header: 'Contact', value: (r) => [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(' ') },
    { key: 'salesId', header: 'Sales ID', value: (r) => r.ownerWorkspace?.code }, { key: 'createdAt', header: 'Created (UTC)' },
  ],
});

const ctx = requestContext;
export default {
  ...base,
  board: async (req, res) => ok(res, await s.board(req.scope, req.valid.query)),
  move: async (req, res) => ok(res, await s.moveDeal(req.scope, req.valid.params.id, req.valid.body, ctx(req))),
  listPipelines: async (req, res) => ok(res, await s.listPipelines(req.scope, req.valid.query)),
  createPipeline: async (req, res) => created(res, await s.createPipeline(req.scope, req.valid.body, ctx(req))),
  updatePipeline: async (req, res) => ok(res, await s.updatePipeline(req.scope, req.valid.params.id, req.valid.body, ctx(req))),
  deletePipeline: async (req, res) => ok(res, await s.deletePipeline(req.scope, req.valid.params.id, ctx(req))),
  addStage: async (req, res) => created(res, await s.addStage(req.scope, req.valid.params.id, req.valid.body, ctx(req))),
  updateStage: async (req, res) => ok(res, await s.updateStage(req.scope, req.valid.params.id, req.valid.params.stageId, req.valid.body, ctx(req))),
  reorderStages: async (req, res) => ok(res, await s.reorderStages(req.scope, req.valid.params.id, req.valid.body.stageIds, ctx(req))),
  deleteStage: async (req, res) => ok(res, await s.deleteStage(req.scope, req.valid.params.id, req.valid.params.stageId, req.valid.body, ctx(req))),
};
