import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import Toasts from './components/common/Toasts';
import { refreshSession } from './services/axiosInstance';
import { authApi } from './services/commonService';
import { useAuthStore } from './store/authStore';

export default function App() {
  const { setUser, clear } = useAuthStore();
  // On load, restore the session from the httpOnly refresh cookie.
  useEffect(() => {
    refreshSession()
      .then(() => authApi.me())
      .then((r) => setUser(r.data.data))
      .catch(() => clear());
  }, [setUser, clear]);
  return (
    <BrowserRouter>
      <AppRoutes />
      <Toasts />
    </BrowserRouter>
  );
}
