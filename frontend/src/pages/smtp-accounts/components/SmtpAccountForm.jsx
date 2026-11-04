import { useEffect, useState } from 'react';
import { Modal, Spinner, Alert } from '../../../components/common/ui';
import { FormGrid, Checkbox, Field } from '../../../components/forms/fields';
import { smtpService } from '../services/smtpService';
import { useSalesIdStore } from '../../../store/salesIdStore';
import { errorMessage, fieldErrors } from '../../../services/axiosInstance';
import { toast } from '../../../store/uiStore';

export default function SmtpAccountForm({ open, onClose, account, onSaved }) {
  const options = useSalesIdStore((s) => s.options);
  const [providers, setProviders] = useState({});
  const [v, setV] = useState({
    name: account?.name ?? '', provider: account?.provider ?? 'GMAIL', fromEmail: account?.fromEmail ?? '', fromName: account?.fromName ?? '', host: account?.host ?? '', port: account?.port ?? '',
    security: account?.security ?? '', authType: account?.authType ?? 'PASSWORD', username: account?.username ?? '', password: '', clientId: '', clientSecret: '', refreshToken: '',
    hourlyLimit: account?.hourlyLimit ?? '', dailyLimit: account?.dailyLimit ?? '', isEnabled: account?.isEnabled ?? true,
  });
  const [ws, setWs] = useState(account?.workspaces?.map((w) => w.id) ?? []);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { smtpService.providers().then((r) => setProviders(r.data.data)); }, []);
  const preset = providers[v.provider];
  const applyPreset = (next) => {
    const p = providers[next.provider];
    if (!account && p && next.provider !== v.provider) Object.assign(next, { host: p.host, port: p.port, security: p.security, hourlyLimit: p.hourlyLimit, dailyLimit: p.dailyLimit });
    if (!account && next.fromEmail !== v.fromEmail && (!v.username || v.username === v.fromEmail)) next.username = next.fromEmail;
    setV(next);
  };
  useEffect(() => {
    const p = providers[v.provider];
    if (!account && p && !v.host) setV((x) => ({ ...x, host: p.host, port: p.port, security: p.security, hourlyLimit: p.hourlyLimit, dailyLimit: p.dailyLimit }));
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: v.name, provider: v.provider, fromEmail: v.fromEmail, fromName: v.fromName || null, host: v.host || undefined, port: v.port ? Number(v.port) : undefined, security: v.security || undefined,
        authType: v.authType, username: v.username, hourlyLimit: v.hourlyLimit ? Number(v.hourlyLimit) : undefined, dailyLimit: v.dailyLimit ? Number(v.dailyLimit) : undefined, isEnabled: v.isEnabled, workspaceIds: ws,
      };
      if (v.authType === 'OAUTH2' && v.clientId) body.oauth = { clientId: v.clientId, clientSecret: v.clientSecret, refreshToken: v.refreshToken };
      if (v.authType === 'PASSWORD' && v.password) body.password = v.password;
      account ? await smtpService.update(account.id, body) : await smtpService.create(body);
      toast(account ? 'SMTP account saved' : 'SMTP account added — test it before sending');
      onSaved?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={account ? `Edit ${account.name}` : 'Add SMTP account'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4" />}Save</button></>}>
      <div className="space-y-4">
        {preset?.notes && <Alert tone="blue">{preset.notes}</Alert>}
        <FormGrid values={v} errors={errors} onChange={applyPreset} fields={[
          { name: 'provider', label: 'Provider', type: 'select', placeholder: false, options: Object.entries(providers).map(([k, p]) => [k, p.label]) }, { name: 'name', label: 'Account name', required: true, placeholder: 'e.g. Sales Gmail 1' },
          { name: 'fromEmail', label: 'From email', type: 'email', required: true }, { name: 'fromName', label: 'From name' },
          { name: 'host', label: 'SMTP host' }, { name: 'port', label: 'Port', type: 'number' },
          { name: 'security', label: 'Encryption', type: 'select', placeholder: false, options: [['SSL', 'SSL/TLS (465)'], ['STARTTLS', 'STARTTLS (587)'], ['NONE', 'None (not recommended)']] },
          preset?.authTypes?.length > 1 && { name: 'authType', label: 'Sign-in method', type: 'select', placeholder: false, options: [['PASSWORD', 'App password'], ['OAUTH2', 'OAuth2']] },
          { name: 'username', label: 'Username', required: true },
          v.authType === 'PASSWORD' && { name: 'password', label: account ? 'New password (leave empty to keep)' : 'Password / app password', type: 'password', autoComplete: 'new-password' },
          v.authType === 'OAUTH2' && { name: 'clientId', label: 'OAuth client ID' }, v.authType === 'OAUTH2' && { name: 'clientSecret', label: 'OAuth client secret', type: 'password' },
          v.authType === 'OAUTH2' && { name: 'refreshToken', label: 'OAuth refresh token', type: 'password', span: 2 },
          { name: 'hourlyLimit', label: 'Max emails per hour', type: 'number', hint: 'Rolling 60 minutes' }, { name: 'dailyLimit', label: 'Max emails per day', type: 'number', hint: 'Rolling 24 hours — use your plan\'s real limit' },
          { name: 'isEnabled', label: 'Enabled', type: 'checkbox' },
        ]} />
        <Field label="Assigned Sales IDs" hint="Campaigns can only use SMTP accounts assigned to their Sales ID.">
          <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-ink-200 p-2 sm:grid-cols-2">
            {options.map((o) => <Checkbox key={o.id} label={`${o.code} · ${o.name}`} checked={ws.includes(o.id)} onChange={(e) => setWs(e.target.checked ? [...ws, o.id] : ws.filter((x) => x !== o.id))} />)}
          </div>
        </Field>
        <p className="text-xs text-ink-500">Passwords are encrypted (AES-256-GCM) on the server and are never shown again.</p>
      </div>
    </Modal>
  );
}
