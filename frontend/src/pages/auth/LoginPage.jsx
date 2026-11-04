import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import AuthShell from './AuthShell';
import { authApi } from '../../services/commonService';
import { errorMessage } from '../../services/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import { TextInput } from '../../components/forms/fields';
import { Alert, Spinner } from '../../components/common/ui';

export default function LoginPage() {
  const [v, setV] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const from = useLocation().state?.from ?? '/';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await authApi.login(v);
      setSession(r.data.data);
      const me = await authApi.me();
      setUser(me.data.data);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Sign in to your CRM.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <TextInput label="Email" type="email" autoComplete="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <TextInput label="Password" type="password" autoComplete="current-password" required value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Sign in</button>
        <div className="flex justify-between text-sm"><Link className="link" to="/forgot-password">Forgot password?</Link><Link className="text-ink-500 hover:underline" to="/setup">First-time setup</Link></div>
      </form>
    </AuthShell>
  );
}
