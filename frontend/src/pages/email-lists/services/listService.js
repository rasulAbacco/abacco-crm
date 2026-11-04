import api from '../../../services/axiosInstance';
export const listService = {
  list: (params) => api.get('/email-lists', { params }),
  get: (id) => api.get(`/email-lists/${id}`),
  create: (b) => api.post('/email-lists', b),
  update: (id, b) => api.put(`/email-lists/${id}`, b),
  remove: (id) => api.delete(`/email-lists/${id}`),
  members: (id, params) => api.get(`/email-lists/${id}/members`, { params }),
  addMembers: (id, b) => api.post(`/email-lists/${id}/members`, b),
  addSegment: (id, b) => api.post(`/email-lists/${id}/members/segment`, b),
  removeMembers: (id, b) => api.post(`/email-lists/${id}/members/remove`, b),
};
