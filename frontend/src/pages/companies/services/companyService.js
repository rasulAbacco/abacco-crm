import api from '../../../services/axiosInstance';
export const companyService = { get: (id) => api.get(`/companies/${id}`), create: (b) => api.post('/companies', b), update: (id, b) => api.put(`/companies/${id}`, b) };
