import api from '../../../services/axiosInstance';
export const campaignService = {
  list: (params) => api.get('/campaigns', { params }),
  get: (id) => api.get(`/campaigns/${id}`),
  create: (b) => api.post('/campaigns', b),
  update: (id, b) => api.put(`/campaigns/${id}`, b),
  remove: (id) => api.delete(`/campaigns/${id}`),
  duplicate: (id) => api.post(`/campaigns/${id}/duplicate`),
  preview: (id) => api.get(`/campaigns/${id}/preview`),
  send: (id) => api.post(`/campaigns/${id}/send`),
  action: (id, a) => api.post(`/campaigns/${id}/${a}`),
  stats: (id) => api.get(`/campaigns/${id}/statistics`),
  recipients: (id, params) => api.get(`/campaigns/${id}/recipients`, { params }),
  test: (id, b) => api.post(`/campaigns/${id}/test`, b),
  eligibleSmtp: (workspaceId) => api.get('/campaigns/eligible-smtp', { params: { workspaceId } }),
};
