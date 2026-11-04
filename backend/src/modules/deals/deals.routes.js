import { Router } from 'express';
import c from './deals.controller.js';
import * as v from './deals.validator.js';
import { buildRecordRouter, idParams } from '../../services/records/recordRouter.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { salesScope } from '../../middleware/salesIdMiddleware.js';

export const dealRoutes = buildRecordRouter(c, v, (router) => {
  router.get('/board', validate({ query: v.boardQuery }), c.board);
  router.post('/:id/move', validate({ params: idParams, body: v.moveSchema }), c.move);
});

export const pipelineRoutes = Router();
pipelineRoutes.use(requireAuth, salesScope);
pipelineRoutes.get('/', validate({ query: v.pipelineListQuery }), c.listPipelines);
pipelineRoutes.post('/', validate({ body: v.pipelineCreate }), c.createPipeline);
pipelineRoutes.put('/:id', validate({ params: v.pipelineParams, body: v.pipelineUpdate }), c.updatePipeline);
pipelineRoutes.delete('/:id', validate({ params: v.pipelineParams }), c.deletePipeline);
pipelineRoutes.post('/:id/stages', validate({ params: v.pipelineParams, body: v.stageCreate }), c.addStage);
pipelineRoutes.put('/:id/stages/order', validate({ params: v.pipelineParams, body: v.stageOrder }), c.reorderStages);
pipelineRoutes.put('/:id/stages/:stageId', validate({ params: v.stageParams, body: v.stageUpdate }), c.updateStage);
pipelineRoutes.delete('/:id/stages/:stageId', validate({ params: v.stageParams, body: v.stageDelete }), c.deleteStage);

export default dealRoutes;
