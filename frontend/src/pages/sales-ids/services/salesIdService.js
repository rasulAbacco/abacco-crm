import api from '../../../services/axiosInstance';
export const salesIdService = {
  list: (params) => api.get('/sales-ids', { params }),
  get: (id) => api.get(`/sales-ids/${id}`),
  create: (b) => api.post('/sales-ids', b),
  update: (id, b) => api.put(`/sales-ids/${id}`, b),
  setStatus: (id, status) => api.patch(`/sales-ids/${id}/status`, { status }),
  setDefault: (id) => api.post(`/sales-ids/${id}/default`),
  remove: (id, b) => api.delete(`/sales-ids/${id}`, { data: b }),
};
