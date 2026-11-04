import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from './AuthShell';
import { authApi } from '../../services/commonService';
import { errorMessage } from '../../services/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import { TextInput } from '../../components/forms/fields';
import { Alert, Spinner } from '../../components/common/ui';

export default function SetupPage() {
  const [v, setV] = useState({ setupToken: '', accountName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { setSession, setUser } = useAuthStore();
  const navigate = useNavigate();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await authApi.setup(v);
      setSession(r.data.data);
      setUser((await authApi.me()).data.data);
      navigate('/sales-ids');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title="Create the primary account" subtitle="One-time setup. You need the SETUP_TOKEN from the server settings.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <TextInput label="Setup token" required value={v.setupToken} onChange={set('setupToken')} />
        <TextInput label="Company / account name" required value={v.accountName} onChange={set('accountName')} />
        <TextInput label="Your name" required value={v.name} onChange={set('name')} />
        <TextInput label="Login email" type="email" required value={v.email} onChange={set('email')} />
        <TextInput label="Password" type="password" required hint="At least 10 characters with letters and a number" value={v.password} onChange={set('password')} />
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Create account</button>
        <p className="text-center text-sm"><Link className="link" to="/login">Back to sign in</Link></p>
      </form>
    </AuthShell>
  );
}
