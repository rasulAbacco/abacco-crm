import api from '../../../services/axiosInstance';
export const automationService = {
  list: (params) => api.get('/automations', { params }),
  get: (id) => api.get(`/automations/${id}`),
  create: (b) => api.post('/automations', b),
  update: (id, b) => api.put(`/automations/${id}`, b),
  activate: (id) => api.post(`/automations/${id}/activate`),
  pause: (id) => api.post(`/automations/${id}/pause`),
  remove: (id) => api.delete(`/automations/${id}`),
  enroll: (id, b) => api.post(`/automations/${id}/enroll`, b),
  enrollments: (id, params) => api.get(`/automations/${id}/enrollments`, { params }),
  executions: (id, params) => api.get(`/automations/${id}/executions`, { params }),
};
