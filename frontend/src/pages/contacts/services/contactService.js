import api from '../../../services/axiosInstance';
export const contactService = {
  get: (id) => api.get(`/contacts/${id}`),
  create: (b) => api.post('/contacts', b),
  update: (id, b) => api.put(`/contacts/${id}`, b),
  consent: (id, b) => api.post(`/contacts/${id}/consent`, b),
  erase: (id) => api.post(`/contacts/${id}/erase`),
};
