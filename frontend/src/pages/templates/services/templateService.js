import api from '../../../services/axiosInstance';
export const templateService = {
  list: (params) => api.get('/templates', { params }),
  get: (id) => api.get(`/templates/${id}`),
  create: (b) => api.post('/templates', b),
  update: (id, b) => api.put(`/templates/${id}`, b),
  remove: (id) => api.delete(`/templates/${id}`),
  duplicate: (id) => api.post(`/templates/${id}/duplicate`),
};
