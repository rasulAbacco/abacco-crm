import { useState } from 'react';
import { FiDownload } from 'react-icons/fi';
import api, { download, errorMessage } from '../../services/axiosInstance';
import { useApi } from '../../hooks/useApi';
import { toast } from '../../store/uiStore';
import { PageHeader, Tabs, Card, Loading, ErrorState, StatCard, StatusBadge } from '../../components/common/ui';
import { BarChartBox, DonutBox } from '../../components/charts/Charts';
import { formatMoneyList, humanize, num, pct } from '../../utils/format';

function ExportMenu({ report, params }) {
  const go = (format) => download('/reports/export', { ...params, report, format }, `report.${format}`).catch((e) => toast(errorMessage(e), 'error'));
  return <div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => go('csv')}><FiDownload /> CSV</button><button className="btn-secondary btn-sm" onClick={() => go('xlsx')}><FiDownload /> Excel</button></div>;
}

function SalesReport({ params }) {
  const { data: d, loading, error, reload } = useApi(() => api.get('/reports/sales', { params }), [JSON.stringify(params)]);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const stages = Object.values(d.dealsByStage.reduce((a, r) => { (a[r.stage] ??= { stage: r.stage, deals: 0 }).deals += r.count; return a; }, {}));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="New leads" value={num(d.totals.leadsInRange)} /><StatCard label="Conversion rate" value={pct(d.conversionRate)} />
        <StatCard label="Won revenue" tone="green" value={formatMoneyList(d.wonRevenue, { compact: true })} /><StatCard label="Lost deals" tone="red" value={num(d.totals.lostDeals)} />
        <StatCard label="Pipeline value" value={formatMoneyList(d.pipelineValue, { compact: true })} /><StatCard label="Win rate" value={pct(d.winRate)} />
        <StatCard label="Tasks completed" value={num(d.tasks.completed)} hint={`${d.tasks.completedOnTime} on time`} /><StatCard label="Overdue now" tone="amber" value={num(d.tasks.overdueNow)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Leads by source" actions={<ExportMenu report="leads-by-source" params={params} />}><BarChartBox layout="vertical" data={d.leadsBySource} x="source" bars={[{ key: 'count', label: 'Leads' }]} /></Card>
        <Card title="Leads by status"><DonutBox data={d.leadsByStatus.map((x) => ({ name: humanize(x.status), count: x.count }))} nameKey="name" valueKey="count" /></Card>
        <Card title="Deals by stage"><BarChartBox data={stages} x="stage" bars={[{ key: 'deals', label: 'Deals' }]} /></Card>
        <Card title="Activity"><BarChartBox data={d.activities.map((a) => ({ type: humanize(a.type), count: a._count._all }))} x="type" bars={[{ key: 'count', label: 'Activities' }]} /></Card>
      </div>
    </div>
  );
}

function EmailReport({ params }) {
  const { data: d, loading, error, reload } = useApi(() => api.get('/reports/email', { params }), [JSON.stringify(params)]);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Accepted by SMTP" value={num(d.totals.accepted)} /><StatCard label="Bounce rate" tone="amber" value={pct(d.rates.bounceRate)} />
        <StatCard label="Open rate (estimated)" value={pct(d.rates.openRateEstimated)} /><StatCard label="Click rate" value={pct(d.rates.clickRate)} />
        <StatCard label="Unsubscribe rate" value={pct(d.rates.unsubscribeRate)} /><StatCard label="Failed" tone="red" value={num(d.totals.failed)} />
        <StatCard label="Spam complaints" tone="red" value={num(d.totals.complaints)} hint="Amazon SES only" /><StatCard label="Delivery events" value={num(d.totals.deliveredEvents)} hint="Amazon SES only" />
      </div>
      <Card title="Campaign performance" actions={<ExportMenu report="campaigns" params={params} />} bodyClass="p-0">
        <div className="overflow-x-auto"><table className="min-w-full divide-y divide-ink-200 text-sm">
          <thead className="bg-ink-50"><tr>{['Campaign', 'Sales ID', 'Status', 'Recipients', 'Accepted', 'Failed', 'Bounced', 'Opens*', 'Clicks', 'Unsubs'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink-100">{d.campaigns.map((c) => <tr key={c.id}><td className="td font-medium">{c.name}</td><td className="td">{c.ownerWorkspace.code}</td><td className="td"><StatusBadge value={c.status} /></td>{['total', 'accepted', 'failed', 'bounced', 'opens', 'clicks', 'unsubscribed'].map((k) => <td key={k} className="td tabular-nums">{c.stats?.[k] ?? 0}</td>)}</tr>)}</tbody>
        </table></div>
      </Card>
      <Card title="SMTP account performance" actions={<ExportMenu report="smtp" params={params} />}>
        <BarChartBox data={d.smtp.map((s) => ({ name: s.name, accepted: s.accepted, failed: s.failed, bounced: s.bounced }))} x="name" bars={[{ key: 'accepted', label: 'Accepted' }, { key: 'failed', label: 'Failed', color: '#ef4444' }, { key: 'bounced', label: 'Bounced', color: '#f59e0b' }]} />
      </Card>
      <p className="text-xs text-ink-400">* Opens are estimates. “Accepted” means the receiving server took the message; inbox placement is not reported by SMTP.</p>
    </div>
  );
}

function ComparisonReport({ params }) {
  const { data, loading, error, reload } = useApi(() => api.get('/reports/sales-ids', { params }), [JSON.stringify(params)]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <Card title="Leads, deals and emails per Sales ID" actions={<ExportMenu report="sales-ids" params={params} />}>
        <BarChartBox data={data.map((w) => ({ code: w.code, leads: w.leads, wonDeals: w.wonDeals, emails: w.emailsAccepted }))} x="code" bars={[{ key: 'leads', label: 'Leads' }, { key: 'wonDeals', label: 'Won deals' }, { key: 'emails', label: 'Emails accepted' }]} />
      </Card>
      <Card bodyClass="p-0"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-ink-200 text-sm">
        <thead className="bg-ink-50"><tr>{['Sales ID', 'Leads', 'Conversion', 'Open deals', 'Won', 'Lost', 'Pipeline', 'Won revenue', 'Campaigns', 'Accepted', 'Opens*', 'Clicks', 'Bounced'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-ink-100">{data.map((w) => <tr key={w.id}><td className="td font-medium">{w.code} <span className="text-ink-500">{w.name}</span></td><td className="td">{w.leads}</td><td className="td">{w.leads ? `${Math.round((w.convertedLeads / w.leads) * 1000) / 10}%` : '—'}</td><td className="td">{w.openDeals}</td><td className="td">{w.wonDeals}</td><td className="td">{w.lostDeals}</td><td className="td whitespace-nowrap">{formatMoneyList(w.pipelineValue, { compact: true })}</td><td className="td whitespace-nowrap">{formatMoneyList(w.wonRevenue, { compact: true })}</td><td className="td">{w.campaigns}</td><td className="td">{w.emailsAccepted}</td><td className="td">{w.uniqueOpens}</td><td className="td">{w.uniqueClicks}</td><td className="td">{w.bounced}</td></tr>)}</tbody>
      </table></div></Card>
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const params = { from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() };
  return (
    <div>
      <PageHeader title="Reports" subtitle="Filtered by the Sales ID selected at the top" actions={<><input type="date" className="input w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><span className="text-ink-500">to</span><input type="date" className="input w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sales', label: 'Sales' }, { value: 'email', label: 'Email' }, { value: 'compare', label: 'Sales ID comparison' }]} />
      {tab === 'sales' && <SalesReport params={params} />}
      {tab === 'email' && <EmailReport params={params} />}
      {tab === 'compare' && <ComparisonReport params={params} />}
    </div>
  );
}
