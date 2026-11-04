import api from '../../../services/axiosInstance';
export const dealService = {
  get: (id) => api.get(`/deals/${id}`),
  create: (b) => api.post('/deals', b),
  update: (id, b) => api.put(`/deals/${id}`, b),
  board: (params) => api.get('/deals/board', { params }),
  move: (id, b) => api.post(`/deals/${id}/move`, b),
  pipelines: () => api.get('/pipelines'),
  addStage: (pid, b) => api.post(`/pipelines/${pid}/stages`, b),
  updateStage: (pid, sid, b) => api.put(`/pipelines/${pid}/stages/${sid}`, b),
  reorder: (pid, stageIds) => api.put(`/pipelines/${pid}/stages/order`, { stageIds }),
  deleteStage: (pid, sid, b) => api.delete(`/pipelines/${pid}/stages/${sid}`, { data: b }),
  createPipeline: (b) => api.post('/pipelines', b),
};
