import api from './axiosInstance';

export const authApi = {
  login: (b) => api.post('/auth/login', b),
  setup: (b) => api.post('/auth/setup', b),
  logout: () => api.post('/auth/logout', {}),
  me: () => api.get('/auth/me'),
  updateMe: (b) => api.patch('/auth/me', b),
  forgot: (b) => api.post('/auth/forgot-password', b),
  reset: (b) => api.post('/auth/reset-password', b),
  changePassword: (b) => api.post('/auth/change-password', b),
};

export const salesIdOptions = () => api.get('/sales-ids/options');
export const notificationsApi = { list: () => api.get('/notifications'), read: (id) => api.post(`/notifications/${id}/read`), readAll: () => api.post('/notifications/read-all') };
export const recordsApi = {
  shares: (entity, id) => api.get(`/records/${entity}/${id}/shares`),
  share: (entity, id, b) => api.post(`/records/${entity}/${id}/shares`, b),
  revoke: (entity, id, ws) => api.delete(`/records/${entity}/${id}/shares/${ws}`),
  transfer: (entity, id, b) => api.post(`/records/${entity}/${id}/transfer`, b),
  bulkShare: (entity, b) => api.post(`/records/${entity}/bulk-share`, b),
  bulkTransfer: (entity, b) => api.post(`/records/${entity}/bulk-transfer`, b),
};
export const notesApi = { create: (b) => api.post('/notes', b), remove: (id) => api.delete(`/notes/${id}`), logActivity: (b) => api.post('/activities', b) };
export const tagsApi = { list: () => api.get('/tags') };
