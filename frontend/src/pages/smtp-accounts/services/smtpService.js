import api from '../../../services/axiosInstance';
export const smtpService = {
  providers: () => api.get('/smtp-accounts/providers'),
  list: () => api.get('/smtp-accounts'),
  create: (b) => api.post('/smtp-accounts', b),
  update: (id, b) => api.put(`/smtp-accounts/${id}`, b),
  remove: (id) => api.delete(`/smtp-accounts/${id}`),
  test: (id, b) => api.post(`/smtp-accounts/${id}/test`, b),
  logs: (id) => api.get(`/smtp-accounts/${id}/logs`),
};
