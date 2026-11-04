import { useState } from 'react';
import { FiPlus, FiZap, FiEdit2, FiTrash2, FiFileText, FiServer } from 'react-icons/fi';
import { smtpService } from './services/smtpService';
import SmtpAccountForm from './components/SmtpAccountForm';
import { useApi } from '../../hooks/useApi';
import { PageHeader, Loading, ErrorState, EmptyState, StatusBadge, Badge, ProgressBar, Modal, ConfirmDialog, Alert } from '../../components/common/ui';
import { TextInput } from '../../components/forms/fields';
import { formatDateTime, humanize } from '../../utils/format';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

export default function SmtpAccountList() {
  const { data, loading, error, reload } = useApi(() => smtpService.list(), []);
  const [form, setForm] = useState(null);
  const [testing, setTesting] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [logs, setLogs] = useState(null);
  const [del, setDel] = useState(null);
  const runTest = async () => {
    setTestResult({ busy: true });
    try {
      const r = await smtpService.test(testing.id, testTo ? { sendTo: testTo } : {});
      setTestResult(r.data.data);
      reload();
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err) });
    }
  };
  return (
    <div>
      <PageHeader title="SMTP accounts" subtitle="Mailboxes used to send campaigns and automations" actions={<button className="btn-primary" onClick={() => setForm({})}><FiPlus /> Add account</button>} />
      <Alert tone="blue">Each account sends only within the limits you set (rolling hour and day). The system never rotates accounts to get around a provider's limits. Set up SPF, DKIM and DMARC for your sending domains.</Alert>
      <div className="mt-4">
        {loading && !data ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : data.length === 0 ? <div className="card"><EmptyState icon={FiServer} title="No SMTP accounts" description="Add Gmail, Zoho, Yahoo, Rediffmail, Amazon SES or any SMTP server." action={<button className="btn-primary" onClick={() => setForm({})}><FiPlus /> Add account</button>} /></div> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-semibold">{a.name}</p><p className="truncate text-sm text-ink-500">{a.fromEmail} · {humanize(a.provider)}</p></div>
                  <div className="flex shrink-0 gap-1"><StatusBadge value={a.isEnabled ? a.health : 'INACTIVE'} /></div>
                </div>
                <p className="mt-2 text-xs text-ink-500">{a.host}:{a.port} · {a.security} · {a.authType === 'OAUTH2' ? 'OAuth2' : 'Password'}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div><p className="mb-1 text-ink-500">Last hour: {a.usage?.lastHour ?? 0} / {a.hourlyLimit}</p><ProgressBar value={a.usage?.lastHour ?? 0} total={a.hourlyLimit} /></div>
                  <div><p className="mb-1 text-ink-500">Last 24 h: {a.usage?.last24h ?? 0} / {a.dailyLimit}</p><ProgressBar value={a.usage?.last24h ?? 0} total={a.dailyLimit} /></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">{a.workspaces.length ? a.workspaces.map((w) => <Badge key={w.id}>{w.code}</Badge>) : <span className="text-xs text-amber-700">Not assigned to any Sales ID</span>}</div>
                {a.lastError && <p className="mt-2 line-clamp-2 text-xs text-red-700">{a.lastError}</p>}
                <p className="mt-1 text-[11px] text-ink-400">Last tested {a.lastTestedAt ? formatDateTime(a.lastTestedAt) : 'never'}</p>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                  <button className="btn-secondary btn-sm" onClick={() => { setTesting(a); setTestResult(null); }}><FiZap /> Test</button>
                  <button className="btn-secondary btn-sm" onClick={() => setForm(a)}><FiEdit2 /> Edit</button>
                  <button className="btn-secondary btn-sm" onClick={() => smtpService.logs(a.id).then((r) => setLogs({ a, ...r.data.data }))}><FiFileText /> Logs</button>
                  <button className="btn-secondary btn-sm" onClick={() => smtpService.update(a.id, { isEnabled: !a.isEnabled }).then(reload).catch((e) => toast(errorMessage(e), 'error'))}>{a.isEnabled ? 'Disable' : 'Enable'}</button>
                  <button className="btn-ghost btn-sm text-red-700" onClick={() => setDel(a)} aria-label="Delete"><FiTrash2 /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {form && <SmtpAccountForm open account={form.id ? form : null} onClose={() => setForm(null)} onSaved={reload} />}
      <Modal open={!!testing} onClose={() => setTesting(null)} title={`Test ${testing?.name ?? ''}`} footer={<><button className="btn-secondary" onClick={() => setTesting(null)}>Close</button><button className="btn-primary" disabled={testResult?.busy} onClick={runTest}>Run test</button></>}>
        <p className="mb-3 text-sm text-ink-700">Connects and signs in to the SMTP server. Optionally sends one test email.</p>
        <TextInput label="Send a test email to (optional)" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        {testResult && !testResult.busy && <div className="mt-3"><Alert tone={testResult.ok ? 'green' : 'red'}>{testResult.message}</Alert></div>}
      </Modal>
      <Modal open={!!logs} onClose={() => setLogs(null)} size="lg" title={`Sending log · ${logs?.a.name ?? ''}`}>
        {logs && <div className="space-y-4 text-sm">
          <div><p className="label">Daily volume (last 30 days)</p>{logs.daily.length ? <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">{logs.daily.map((d) => <li key={d.windowStart} className="rounded bg-ink-50 px-2 py-1 text-xs">{d.windowStart.slice(0, 10)}: {d.sentCount} sent, {d.failedCount} failed</li>)}</ul> : <p className="text-ink-500">No sends yet.</p>}</div>
          <div><p className="label">Recent failures</p>{logs.failures.length ? <ul className="divide-y divide-ink-100">{logs.failures.map((f) => <li key={f.id} className="py-1.5"><p>{f.email} · <span className="text-ink-500">{f.campaign.name}</span></p><p className="text-xs text-red-700">{f.lastError}</p></li>)}</ul> : <p className="text-ink-500">No failures.</p>}</div>
        </div>}
      </Modal>
      <ConfirmDialog open={!!del} title={`Delete ${del?.name}?`} message="Campaigns using it will switch to their other accounts, or pause if none is left." confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={() => smtpService.remove(del.id).then(() => { toast('Deleted'); setDel(null); reload(); }).catch((e) => toast(errorMessage(e), 'error'))} />
    </div>
  );
}
