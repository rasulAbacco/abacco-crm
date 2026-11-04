import api from '../../../services/axiosInstance';
export const leadService = {
  get: (id) => api.get(`/leads/${id}`),
  create: (b) => api.post('/leads', b),
  update: (id, b) => api.put(`/leads/${id}`, b),
  convert: (id, b) => api.post(`/leads/${id}/convert`, b),
};
