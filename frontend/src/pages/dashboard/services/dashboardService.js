import api from '../../../services/axiosInstance';
export const getDashboard = (params) => api.get('/dashboard', { params });
