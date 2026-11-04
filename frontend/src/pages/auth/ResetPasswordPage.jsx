import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import AuthShell from './AuthShell';
import { authApi } from '../../services/commonService';
import { errorMessage } from '../../services/axiosInstance';
import { TextInput } from '../../components/forms/fields';
import { Alert, Spinner } from '../../components/common/ui';
import { toast } from '../../store/uiStore';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await authApi.reset({ token: params.get('token') ?? '', password: pw });
      toast('Password updated. Please sign in.');
      navigate('/login');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
    return null;
  };
  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <TextInput label="New password" type="password" required hint="At least 10 characters with letters and a number" value={pw} onChange={(e) => setPw(e.target.value)} />
        <TextInput label="Repeat new password" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Update password</button>
        <p className="text-center text-sm"><Link className="link" to="/login">Back to sign in</Link></p>
      </form>
    </AuthShell>
  );
}
