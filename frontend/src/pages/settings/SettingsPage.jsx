import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import api, { errorMessage, fieldErrors } from '../../services/axiosInstance';
import { authApi } from '../../services/commonService';
import { useApi } from '../../hooks/useApi';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/uiStore';
import { PageHeader, Tabs, Card, Spinner, Alert, Badge, Modal, StatusBadge } from '../../components/common/ui';
import DataTable from '../../components/common/DataTable';
import { FormGrid, TextArea } from '../../components/forms/fields';
import { formatDateTime, humanize } from '../../utils/format';

function AccountTab() {
  const { data, loading, reload } = useApi(() => api.get('/account'), []);
  const [v, setV] = useState(null);
  const [errors, setErrors] = useState({});
  useEffect(() => { if (data) setV({ name: data.name, defaultCurrency: data.defaultCurrency, defaultTimezone: data.defaultTimezone, defaultLocale: data.defaultLocale, legalName: data.legalName ?? '', postalAddress: data.postalAddress ?? '' }); }, [data]);
  if (loading || !v) return <Spinner />;
  const save = async () => {
    try {
      await api.put('/account', { ...v, legalName: v.legalName || null, postalAddress: v.postalAddress || null });
      toast('Account settings saved');
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <Card title="Account defaults" actions={<button className="btn-primary btn-sm" onClick={save}>Save</button>}>
      <FormGrid values={v} errors={errors} onChange={setV} fields={[
        { name: 'name', label: 'Account name' }, { name: 'defaultLocale', label: 'Number & date format (locale)', type: 'select', placeholder: false, options: [['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['de-DE', 'German'], ['fr-FR', 'French']] },
        { name: 'defaultCurrency', label: 'Default currency', type: 'currency' }, { name: 'defaultTimezone', label: 'Default timezone', type: 'timezone', placeholder: false },
        { name: 'legalName', label: 'Legal name (fallback footer)' }, { name: 'postalAddress', label: 'Postal address (fallback footer)', type: 'textarea', rows: 2 },
      ]} />
      <p className="mt-3 text-xs text-ink-500">All times are stored in UTC and shown in your timezone. Amounts are never converted between currencies.</p>
    </Card>
  );
}

function ProfileTab() {
  const { user, setUser, setSession } = useAuthStore();
  const [p, setP] = useState({ name: user?.name ?? '', timezone: user?.timezone ?? '', locale: user?.locale ?? '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const saveProfile = async () => {
    try {
      await authApi.updateMe({ name: p.name, timezone: p.timezone || null, locale: p.locale || null });
      setUser((await authApi.me()).data.data);
      toast('Profile saved');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const changePw = async () => {
    try {
      const r = await authApi.changePassword(pw);
      setSession(r.data.data);
      setUser((await authApi.me()).data.data);
      setPw({ currentPassword: '', newPassword: '' });
      toast('Password changed. Other sessions were signed out.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Profile" actions={<button className="btn-primary btn-sm" onClick={saveProfile}>Save</button>}>
        <FormGrid values={p} onChange={setP} fields={[{ name: 'name', label: 'Name', span: 2 }, { name: 'timezone', label: 'My timezone', type: 'timezone', placeholder: 'Account default' }, { name: 'locale', label: 'Locale', placeholder: 'Account default' }]} />
        <p className="mt-3 text-xs text-ink-500">Signed in as {user?.email}</p>
      </Card>
      <Card title="Change password" actions={<button className="btn-primary btn-sm" disabled={!pw.currentPassword || pw.newPassword.length < 10} onClick={changePw}>Change</button>}>
        <FormGrid values={pw} onChange={setPw} fields={[{ name: 'currentPassword', label: 'Current password', type: 'password', span: 2 }, { name: 'newPassword', label: 'New password', type: 'password', span: 2, hint: 'At least 10 characters with letters and a number' }]} />
      </Card>
    </div>
  );
}

const REGIMES = ['GDPR', 'UK_GDPR', 'CASL', 'CAN_SPAM', 'DPDP', 'SPAM_ACT', 'OTHER'];
function CountriesTab() {
  const { data, loading, error, reload } = useApi(() => api.get('/account/countries'), []);
  const [edit, setEdit] = useState(null);
  const save = async () => {
    try {
      const { code, ...b } = edit;
      await api.put(`/account/countries/${code}`, { name: b.name, defaultTimezone: b.defaultTimezone, legalRegime: b.legalRegime, requiresPriorConsent: !!b.requiresPriorConsent, businessHoursStart: b.businessHoursStart, businessHoursEnd: b.businessHoursEnd, businessDays: b.businessDays, currency: b.currency || null, notes: b.notes || null });
      toast('Country saved');
      setEdit(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <>
      <Alert tone="blue">Country profiles drive recipient timezones, business-hour sending and consent rules. They are a starting point, not legal advice — check the rules for your market.</Alert>
      <div className="my-3 flex justify-end"><button className="btn-secondary" onClick={() => setEdit({ code: '', name: '', defaultTimezone: 'UTC', legalRegime: 'OTHER', requiresPriorConsent: false, businessHoursStart: '09:00', businessHoursEnd: '18:00', businessDays: [1, 2, 3, 4, 5], isNew: true })}><FiPlus /> Add country</button></div>
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.code} onRowClick={(r) => setEdit({ ...r })} columns={[
        { key: 'code', header: 'Country', render: (r) => <span><b>{r.code}</b> {r.name}</span> }, { key: 'tz', header: 'Timezone', render: (r) => r.defaultTimezone },
        { key: 'reg', header: 'Rules', render: (r) => <Badge>{r.legalRegime.replace('_', ' ')}</Badge> }, { key: 'consent', header: 'Prior consent', render: (r) => (r.requiresPriorConsent ? <Badge tone="amber">Required</Badge> : 'Not required') },
        { key: 'hours', header: 'Business hours', render: (r) => `${r.businessHoursStart}–${r.businessHoursEnd}` },
      ]} />
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.isNew ? 'Add country' : `${edit.code} · ${edit.name}`} footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></>}>
          <FormGrid values={edit} onChange={setEdit} fields={[
            edit.isNew && { name: 'code', label: 'Country', type: 'country' }, { name: 'name', label: 'Name' }, { name: 'defaultTimezone', label: 'Default timezone', type: 'timezone', placeholder: false },
            { name: 'legalRegime', label: 'Email rules', type: 'select', options: REGIMES, placeholder: false }, { name: 'currency', label: 'Currency', type: 'currency', placeholder: 'None' },
            { name: 'requiresPriorConsent', label: 'Require recorded consent before emailing', type: 'checkbox', span: 2 },
            { name: 'businessHoursStart', label: 'Business hours start', type: 'time' }, { name: 'businessHoursEnd', label: 'Business hours end', type: 'time' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
          ]} />
        </Modal>
      )}
    </>
  );
}

function SuppressionsTab() {
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [emails, setEmails] = useState('');
  const { data, meta, loading, error, reload } = useApi(() => api.get('/suppressions', { params: { page, reason: reason || undefined } }), [page, reason]);
  const summary = useApi(() => api.get('/suppressions/summary'), [data]);
  const add = async () => {
    try {
      const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
      const r = await api.post('/suppressions', { emails: list });
      toast(`${r.data.data.added} address(es) suppressed`);
      setAdding(false);
      setEmails('');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const remove = async (id) => {
    try {
      await api.delete(`/suppressions/${id}`);
      toast('Removed');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <>
      <Alert tone="blue">Suppressed addresses are never emailed from any Sales ID. Unsubscribes, complaints and erasure requests cannot be removed.</Alert>
      <div className="my-3 flex flex-wrap items-center gap-2">
        {Object.entries(summary.data ?? {}).map(([k, n]) => <Badge key={k}>{humanize(k)}: {n}</Badge>)}
        <select className="input ml-auto w-44" value={reason} onChange={(e) => { setReason(e.target.value); setPage(1); }} aria-label="Reason"><option value="">All reasons</option>{['UNSUBSCRIBED', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL', 'ERASURE', 'INVALID'].map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</select>
        <button className="btn-secondary" onClick={() => setAdding(true)}><FiPlus /> Add addresses</button>
      </div>
      <DataTable rows={data} meta={meta} loading={loading} error={error} onRetry={reload} onPage={setPage} columns={[
        { key: 'email', header: 'Email', render: (r) => r.emailNormalized ?? <span className="text-ink-400">erased (hash kept)</span> }, { key: 'reason', header: 'Reason', render: (r) => <StatusBadge value={r.reason} /> },
        { key: 'source', header: 'Source', render: (r) => humanize(r.source) }, { key: 'at', header: 'Added', render: (r) => formatDateTime(r.createdAt) },
        { key: 'x', header: '', render: (r) => !['UNSUBSCRIBED', 'COMPLAINT', 'ERASURE'].includes(r.reason) && <button className="btn-ghost btn-sm text-red-700" onClick={() => remove(r.id)} aria-label="Remove"><FiTrash2 /></button> },
      ]} />
      <Modal open={adding} onClose={() => setAdding(false)} title="Suppress addresses" footer={<><button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" onClick={add} disabled={!emails.trim()}>Add</button></>}>
        <TextArea label="Email addresses (one per line, or comma separated)" rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} />
      </Modal>
    </>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, meta, loading, error, reload } = useApi(() => api.get('/audit-logs', { params: { page, action: action || undefined } }), [page, action]);
  return (
    <>
      <div className="mb-3 flex justify-end"><select className="input w-52" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Action"><option value="">All actions</option>{['auth.', 'sales_id.', 'record.', 'lead.', 'contact.', 'deal.', 'campaign.', 'smtp.', 'automation.', 'suppression.'].map((a) => <option key={a} value={a}>{a.replace('.', '')}</option>)}</select></div>
      <DataTable rows={data} meta={meta} loading={loading} error={error} onRetry={reload} onPage={setPage} columns={[
        { key: 'at', header: 'When', render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span> }, { key: 'action', header: 'Action', render: (r) => <code className="text-xs">{r.action}</code> },
        { key: 'entity', header: 'Record', render: (r) => `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}` }, { key: 'ws', header: 'Sales ID', render: (r) => r.workspace?.code ?? '—' },
        { key: 'user', header: 'By', render: (r) => r.user?.name ?? 'System' }, { key: 'meta', header: 'Details', render: (r) => <span className="line-clamp-2 max-w-xs text-xs text-ink-500">{JSON.stringify(r.after ?? r.metadata ?? '')}</span> },
      ]} />
    </>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'account';
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ value: 'account', label: 'Account' }, { value: 'profile', label: 'Profile & password' }, { value: 'countries', label: 'Countries & compliance' }, { value: 'suppressions', label: 'Suppression list' }, { value: 'audit', label: 'Audit log' }]} />
      {tab === 'account' && <AccountTab />}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'countries' && <CountriesTab />}
      {tab === 'suppressions' && <SuppressionsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
