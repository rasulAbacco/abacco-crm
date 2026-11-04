import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from './AuthShell';
import { authApi } from '../../services/commonService';
import { errorMessage } from '../../services/axiosInstance';
import { TextInput } from '../../components/forms/fields';
import { Alert, Spinner } from '../../components/common/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authApi.forgot({ email });
      setMsg({ tone: 'green', text: r.data.data.message });
    } catch (err) {
      setMsg({ tone: 'red', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link that works for 30 minutes.">
      <form onSubmit={submit} className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <TextInput label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Send reset link</button>
        <p className="text-center text-sm"><Link className="link" to="/login">Back to sign in</Link></p>
      </form>
    </AuthShell>
  );
}
