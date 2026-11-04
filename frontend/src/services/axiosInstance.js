// One Axios instance for the whole app: adds the access token and the
// selected Sales ID, refreshes an expired session once, and normalises errors.
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useSalesIdStore } from '../store/salesIdStore';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api/v1', withCredentials: true, timeout: 60000 });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (!config.headers['X-Sales-Id']) config.headers['X-Sales-Id'] = useSalesIdStore.getState().selected ?? 'all';
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  return config;
});

let refreshing = null;
export function refreshSession() {
  refreshing ??= axios
    .post(`${api.defaults.baseURL}/auth/refresh`, null, { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then((r) => {
      useAuthStore.getState().setSession(r.data.data);
      return r.data.data.accessToken;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && !original._retried && !original.url.includes('/auth/')) {
      original._retried = true;
      try {
        const token = await refreshSession();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().clear();
      }
    }
    if (code === 'SALES_ID_FORBIDDEN') useSalesIdStore.getState().select('all');
    return Promise.reject(error);
  },
);

/** Human-readable message from an API error. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const e = err?.response?.data?.error;
  if (!e) return err?.code === 'ECONNABORTED' ? 'The server took too long to answer.' : err?.message === 'Network Error' ? 'Cannot reach the server. Check your connection.' : fallback;
  if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length) return e.details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join(' · ');
  if (e.code === 'CAMPAIGN_NOT_READY' && e.details?.issues) return e.details.issues.join(' ');
  return e.message ?? fallback;
}

export function fieldErrors(err) {
  const d = err?.response?.data?.error?.details;
  if (!Array.isArray(d)) return {};
  return Object.fromEntries(d.filter((x) => x.path).map((x) => [x.path.split('.')[0], x.message]));
}

/** Downloads a file response (CSV/XLSX export). */
export async function download(url, params, filename) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? filename;
  const href = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export default api;
