import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPause, FiPlay, FiXCircle, FiRotateCcw, FiCopy, FiBarChart2, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { campaignService } from './services/campaignService';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/common/DataTable';
import { PageHeader, Loading, ErrorState, StatusBadge, StatCard, Card, Alert, ProgressBar, ConfirmDialog, Badge, DefinitionList } from '../../components/common/ui';
import { formatDateTime, formatMoney, humanize, num, pct } from '../../utils/format';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

const ST = ['PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'SUPPRESSED', 'SKIPPED', 'CANCELLED'];

export default function CampaignDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(null);
  const camp = useApi(() => campaignService.get(id), [id]);
  const stats = useApi(() => campaignService.stats(id), [id]);
  const rec = useApi(() => campaignService.recipients(id, { page, status: status || undefined }), [id, page, status]);
  const c = camp.data;
  const live = c && ['SENDING', 'QUEUED', 'SCHEDULED'].includes(c.status);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => { camp.reload(); stats.reload(); rec.reload(); }, 10000);
    return () => clearInterval(t);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  if (camp.loading && !c) return <Loading />;
  if (camp.error) return <ErrorState message={camp.error} onRetry={camp.reload} />;
  const s = stats.data;
  const act = async (action, msg) => {
    try {
      if (action === 'duplicate') { const r = await campaignService.duplicate(id); toast('Copy created'); navigate(`/campaigns/${r.data.data.id}/edit`); return; }
      if (action === 'delete') { await campaignService.remove(id); toast('Deleted'); navigate('/campaigns'); return; }
      const r = await campaignService.action(id, action);
      toast(msg ?? (r.data.data.requeued !== undefined ? `${r.data.data.requeued} recipients queued again` : 'Done'));
      setConfirm(null);
      camp.reload(); stats.reload(); rec.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const done = s ? s.total - s.counts.PENDING - s.counts.QUEUED - s.counts.SENDING : 0;
  return (
    <div className="space-y-4">
      <PageHeader back={<Link to="/campaigns" className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"><FiArrowLeft /> Campaigns</Link>} title={c.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge value={c.status} /><Badge>{c.ownerWorkspace.code}</Badge>{c.subject}</span>}
        actions={<>
          <Link to={`/campaigns/${id}/analytics`} className="btn-secondary"><FiBarChart2 /> Analytics</Link>
          {['SENDING', 'SCHEDULED', 'QUEUED'].includes(c.status) && <button className="btn-secondary" onClick={() => act('pause', 'Paused')}><FiPause /> Pause</button>}
          {c.status === 'PAUSED' && <button className="btn-primary" onClick={() => act('resume', 'Resumed')}><FiPlay /> Resume</button>}
          {c.status === 'SCHEDULED' && <button className="btn-secondary" onClick={() => act('unschedule', 'Back to draft')}><FiEdit2 /> Unschedule</button>}
          {['COMPLETED_WITH_ERRORS', 'FAILED', 'PAUSED'].includes(c.status) && s?.counts.FAILED > 0 && <button className="btn-secondary" onClick={() => setConfirm('retry-failed')}><FiRotateCcw /> Retry failed</button>}
          {['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'].includes(c.status) && <button className="btn-secondary text-red-700" onClick={() => setConfirm('cancel')}><FiXCircle /> Cancel</button>}
          <button className="btn-secondary" onClick={() => act('duplicate')}><FiCopy /> Duplicate</button>
          {!['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'].includes(c.status) && <button className="btn-secondary text-red-700" onClick={() => setConfirm('delete')} aria-label="Delete"><FiTrash2 /></button>}
        </>} />
      {c.statusReason && <Alert>{c.statusReason}</Alert>}
      {s && (
        <>
          <Card>
            <div className="mb-2 flex justify-between text-sm"><span className="font-medium">Progress</span><span className="text-ink-500">{num(done)} of {num(s.total)} processed{live && ' · refreshing every 10 s'}</span></div>
            <ProgressBar value={done} total={s.total} />
            <div className="mt-3 flex flex-wrap gap-1.5">{ST.map((k) => s.counts[k] > 0 && <Badge key={k} tone={{ SENT: 'emerald', FAILED: 'red', BOUNCED: 'red', PENDING: 'gray', QUEUED: 'indigo', SENDING: 'blue' }[k] ?? 'gray'}>{humanize(k)}: {num(s.counts[k])}</Badge>)}{s.retried > 0 && <Badge tone="amber">Retried: {s.retried}</Badge>}</div>
          </Card>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Accepted (SMTP)" value={num(s.accepted)} /><StatCard label="Failed" tone="red" value={num(s.counts.FAILED)} /><StatCard label="Bounced" tone="amber" value={num(s.counts.BOUNCED)} hint={pct(s.rates.bounceRate)} />
            <StatCard label="Opens (estimated)" value={num(s.uniqueOpens)} hint={pct(s.rates.openRateEstimated)} /><StatCard label="Clicks" value={num(s.uniqueClicks)} hint={pct(s.rates.clickRate)} /><StatCard label="Unsubscribed" value={num(s.unsubscribed)} hint={pct(s.rates.unsubscribeRate)} />
          </div>
        </>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Settings">
          <DefinitionList items={[
            ['Schedule', c.scheduleMode === 'RECIPIENT_LOCAL' ? `${c.localSendDate?.slice(0, 10)} ${c.localSendTime} recipient time` : c.scheduleMode === 'FIXED_TIME' ? formatDateTime(c.scheduledAtUtc) : 'Immediately'],
            ['Business hours only', c.respectBusinessHours ? 'Yes' : 'No'], ['Lists', c.lists.map((l) => l.name).join(', ')], ['SMTP accounts', c.smtpAccounts.map((a) => a.name).join(', ')],
            ['Tracking', [c.trackOpens && 'opens', c.trackClicks && 'clicks'].filter(Boolean).join(', ') || 'Off'], ['Started', formatDateTime(c.startedAt)], ['Completed', formatDateTime(c.completedAt)],
            c.pitchAmountMinor && ['Pitch price', `${formatMoney(c.pitchAmountMinor, c.pitchCurrency)}${c.pitchPriceNote ? ` (${c.pitchPriceNote})` : ''}`],
          ]} />
        </Card>
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Recipients</h2><select className="input w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All</option>{ST.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</select></div>
          <DataTable rows={rec.data} meta={rec.meta} loading={rec.loading} error={rec.error} onRetry={rec.reload} onPage={setPage} columns={[
            { key: 'email', header: 'Email', render: (r) => <div><p>{r.email}</p><p className="text-[11px] text-ink-500">{r.countryCode ?? '—'} · {r.recipientTimezone}</p></div> },
            { key: 'status', header: 'Status', render: (r) => <div><StatusBadge value={r.status} />{(r.skipReason || r.lastError) && <p className="mt-0.5 max-w-[16rem] truncate text-[11px] text-ink-500" title={r.lastError ?? r.skipReason}>{r.lastError ?? humanize(r.skipReason)}</p>}</div> },
            { key: 'when', header: 'Scheduled / sent', render: (r) => <span className="text-xs">{formatDateTime(r.sentAt ?? r.scheduledAtUtc)}</span> },
            { key: 'eng', header: 'Engagement', render: (r) => <div className="flex gap-1">{r.firstOpenedAt && <Badge tone="blue">opened</Badge>}{r.firstClickedAt && <Badge tone="green">clicked</Badge>}{r.unsubscribedAt && <Badge tone="amber">unsub</Badge>}</div> },
            { key: 'smtp', header: 'Via', render: (r) => <span className="text-xs">{r.smtpAccount?.name ?? '—'}</span> },
          ]} />
        </div>
      </div>
      <ConfirmDialog open={confirm === 'cancel'} title="Cancel this campaign?" message="Recipients not yet sent will not receive it. Emails already sent cannot be recalled." confirmLabel="Cancel campaign" onClose={() => setConfirm(null)} onConfirm={() => act('cancel', 'Campaign cancelled')} />
      <ConfirmDialog open={confirm === 'retry-failed'} tone="primary" title="Retry failed recipients?" message="Recipients marked FAILED are queued again. Some may have been sent already if the failure was an unknown outcome (worker stopped mid-send) — they could receive it twice." confirmLabel="Retry" onClose={() => setConfirm(null)} onConfirm={() => act('retry-failed')} />
      <ConfirmDialog open={confirm === 'delete'} title="Delete this campaign?" message="Its statistics disappear from reports." confirmLabel="Delete" onClose={() => setConfirm(null)} onConfirm={() => act('delete')} />
    </div>
  );
}
