import api from '../../../services/axiosInstance';
export const taskService = {
  list: (params) => api.get('/tasks', { params }),
  create: (b) => api.post('/tasks', b),
  update: (id, b) => api.put(`/tasks/${id}`, b),
  complete: (id) => api.post(`/tasks/${id}/complete`),
  remove: (id) => api.delete(`/tasks/${id}`),
  bulkStatus: (b) => api.post('/tasks/bulk-status', b),
};
