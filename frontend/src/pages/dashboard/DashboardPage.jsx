import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiUserPlus, FiUsers, FiBriefcase, FiTrello, FiTrendingUp, FiAward, FiXCircle, FiPercent, FiClock, FiCheckSquare, FiSend, FiMail, FiAlertTriangle, FiCornerUpLeft, FiEye, FiMousePointer } from 'react-icons/fi';
import { getDashboard } from './services/dashboardService';
import { useApi } from '../../hooks/useApi';
import { useSalesIdStore } from '../../store/salesIdStore';
import { PageHeader, StatCard, Card, Loading, ErrorState, StatusBadge, ProgressBar, EmptyState } from '../../components/common/ui';
import { BarChartBox, LineChartBox, DonutBox } from '../../components/charts/Charts';
import { formatMoneyList, formatRelative, formatDateTime, formatDate, humanize, num, pct } from '../../utils/format';
import { LEAD_SOURCES } from '../../constants/options';

const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months']];

function bucketLabel(b) {
  return new Date(b).toLocaleDateString('en', { day: '2-digit', month: 'short' });
}

export default function DashboardPage() {
  const [days, setDays] = useState('30');
  const [source, setSource] = useState('');
  const current = useSalesIdStore((s) => s.current());
  const params = { from: new Date(Date.now() - Number(days) * 86400000).toISOString(), source: source || undefined };
  const { data: d, loading, error, reload } = useApi(() => getDashboard(params), [days, source]);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const s = d.sales;
  const e = d.email;
  const leadTrend = d.trends.leads.map((x) => ({ label: bucketLabel(x.bucket), leads: x.count }));
  const emailTrend = d.trends.email.map((x) => ({ label: bucketLabel(x.bucket), accepted: x.sent, failed: x.failed, bounced: x.bounced }));
  const stageData = Object.values(s.dealsByStage.reduce((acc, r) => { (acc[r.stage] ??= { stage: r.stage, deals: 0 }).deals += r.count; return acc; }, {}));

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle={current ? `${current.code} · ${current.name}` : 'All Sales IDs (consolidated)'} actions={<>
        <select className="input w-40" value={source} onChange={(ev) => setSource(ev.target.value)} aria-label="Lead source"><option value="">All sources</option>{LEAD_SOURCES.map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input w-40" value={days} onChange={(ev) => setDays(ev.target.value)} aria-label="Date range">{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={FiUserPlus} label="Leads" value={num(s.totals.leads)} hint={`${num(s.totals.leadsInRange)} new in period`} />
        <StatCard icon={FiUsers} label="Contacts" value={num(s.totals.contacts)} />
        <StatCard icon={FiBriefcase} label="Companies" value={num(s.totals.companies)} />
        <StatCard icon={FiTrello} label="Open deals" value={num(s.totals.openDeals)} />
        <StatCard icon={FiTrendingUp} label="Pipeline value" value={formatMoneyList(s.pipelineValue, { compact: true })} />
        <StatCard icon={FiAward} tone="green" label="Won revenue" value={formatMoneyList(s.wonRevenue, { compact: true })} hint={`${s.totals.wonDeals} won`} />
        <StatCard icon={FiXCircle} tone="red" label="Lost deals" value={num(s.totals.lostDeals)} />
        <StatCard icon={FiPercent} label="Lead conversion" value={pct(s.conversionRate)} hint={s.winRate !== null ? `Win rate ${s.winRate}%` : undefined} />
        <StatCard icon={FiClock} tone="amber" label="Pending follow-ups" value={num(s.totals.pendingFollowUps)} hint={`${s.totals.overdueTasks} overdue`} />
        <StatCard icon={FiCheckSquare} label="Tasks next 7 days" value={num(s.totals.upcomingTasks)} />
        <StatCard icon={FiSend} label="Active campaigns" value={num(e.totals.activeCampaigns)} />
        <StatCard icon={FiMail} label="Emails accepted" value={num(e.totals.accepted)} hint="by SMTP servers" />
        <StatCard icon={FiAlertTriangle} tone="red" label="Failed" value={num(e.totals.failed)} />
        <StatCard icon={FiCornerUpLeft} tone="amber" label="Bounced" value={num(e.totals.bounced)} hint={`${e.rates.bounceRate}% bounce rate`} />
        <StatCard icon={FiEye} label="Open rate (est.)" value={pct(e.rates.openRateEstimated)} />
        <StatCard icon={FiMousePointer} label="Click rate" value={pct(e.rates.clickRate)} />
        <StatCard icon={FiMail} tone="gray" label="Delivery events" value={num(e.totals.deliveredEvents)} hint="Amazon SES only" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="New leads" className="xl:col-span-2"><LineChartBox data={leadTrend} x="label" lines={[{ key: 'leads', label: 'Leads' }]} /></Card>
        <Card title="Lead sources"><DonutBox data={s.leadsBySource} nameKey="source" valueKey="count" /></Card>
        <Card title="Deal pipeline (deals per stage)" className="xl:col-span-2"><BarChartBox data={stageData} x="stage" bars={[{ key: 'deals', label: 'Deals' }]} /></Card>
        <Card title="Revenue won (by currency)">
          {d.trends.revenue.length === 0 ? <EmptyState title="No won deals in this period" /> : (
            <ul className="divide-y divide-ink-100 text-sm">{d.trends.revenue.map((r, i) => <li key={i} className="flex justify-between py-2"><span>{formatDate(r.bucket)}</span><span className="font-medium">{formatMoneyList([{ currency: r.currency, amountMinor: r.amountMinor }])}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Email sending" className="xl:col-span-2"><BarChartBox data={emailTrend} x="label" bars={[{ key: 'accepted', label: 'Accepted', color: '#1d4ed8' }, { key: 'failed', label: 'Failed', color: '#ef4444' }, { key: 'bounced', label: 'Bounced', color: '#f59e0b' }]} /></Card>
        <Card title="Leads by status"><BarChartBox layout="vertical" data={s.leadsByStatus.map((x) => ({ status: humanize(x.status), count: x.count }))} x="status" bars={[{ key: 'count', label: 'Leads' }]} /></Card>
      </div>

      {d.comparison && (
        <Card title="Sales ID comparison" bodyClass="p-0">
          <div className="overflow-x-auto"><table className="min-w-full divide-y divide-ink-200 text-sm">
            <thead className="bg-ink-50"><tr>{['Sales ID', 'Leads', 'Converted', 'Contacts', 'Open deals', 'Pipeline', 'Won', 'Won revenue', 'Emails accepted', 'Opens (est.)', 'Clicks'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-ink-100">{d.comparison.map((w) => (
              <tr key={w.id}><td className="td font-medium">{w.code} <span className="text-ink-500">{w.name}</span></td><td className="td">{w.leads}</td><td className="td">{w.convertedLeads}</td><td className="td">{w.contacts}</td><td className="td">{w.openDeals}</td>
                <td className="td whitespace-nowrap">{formatMoneyList(w.pipelineValue, { compact: true })}</td><td className="td">{w.wonDeals}</td><td className="td whitespace-nowrap">{formatMoneyList(w.wonRevenue, { compact: true })}</td><td className="td">{w.emailsAccepted}</td><td className="td">{w.uniqueOpens}</td><td className="td">{w.uniqueClicks}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card title="Recent activity" className="xl:col-span-2">
          {d.activities.length === 0 ? <EmptyState title="No activity yet" /> : <ul className="space-y-2">{d.activities.map((a) => {
            const target = a.lead ? [`/leads/${a.lead.id}`, a.lead.fullName] : a.contact ? [`/contacts/${a.contact.id}`, [a.contact.firstName, a.contact.lastName].join(' ')] : a.deal ? [`/deals/${a.deal.id}`, a.deal.title] : a.company ? [`/companies/${a.company.id}`, a.company.name] : null;
            return <li key={a.id} className="text-sm"><span className="font-medium">{a.subject}</span>{target && <> · <Link className="link" to={target[0]}>{target[1]}</Link></>}<p className="text-xs text-ink-500">{a.actor?.name ?? 'System'} · {a.workspace.code} · {formatRelative(a.occurredAt)}</p></li>;
          })}</ul>}
        </Card>
        <Card title="Recent leads" actions={<Link to="/leads" className="text-xs link">View all</Link>}>
          {d.recentLeads.length === 0 ? <EmptyState title="No leads yet" /> : <ul className="divide-y divide-ink-100">{d.recentLeads.map((l) => <li key={l.id} className="py-2"><Link className="text-sm font-medium hover:underline" to={`/leads/${l.id}`}>{l.fullName}</Link><p className="flex items-center gap-2 text-xs text-ink-500"><StatusBadge value={l.status} />{l.companyName}</p></li>)}</ul>}
        </Card>
        <Card title="Upcoming tasks" actions={<Link to="/tasks" className="text-xs link">View all</Link>}>
          {d.upcomingTasks.length === 0 ? <EmptyState title="Nothing scheduled" /> : <ul className="divide-y divide-ink-100">{d.upcomingTasks.map((t) => <li key={t.id} className="py-2"><p className="text-sm">{t.title}</p><p className={`text-xs ${t.dueAt && new Date(t.dueAt) < new Date() ? 'text-red-600' : 'text-ink-500'}`}>{t.dueAt ? formatDateTime(t.dueAt) : 'No due date'}</p></li>)}</ul>}
        </Card>
      </div>

      <Card title="Recent campaigns" actions={<Link to="/campaigns" className="text-xs link">View all</Link>}>
        {d.recentCampaigns.length === 0 ? <EmptyState title="No campaigns yet" /> : <ul className="divide-y divide-ink-100">{d.recentCampaigns.map((c) => {
          const total = Object.values(c.progress).reduce((a, b) => a + b, 0);
          const done = (c.progress.SENT ?? 0) + (c.progress.FAILED ?? 0) + (c.progress.BOUNCED ?? 0) + (c.progress.SUPPRESSED ?? 0) + (c.progress.SKIPPED ?? 0) + (c.progress.CANCELLED ?? 0);
          return <li key={c.id} className="grid grid-cols-1 items-center gap-2 py-2.5 sm:grid-cols-3"><Link className="text-sm font-medium hover:underline" to={`/campaigns/${c.id}`}>{c.name}</Link><StatusBadge value={c.status} /><div className="flex items-center gap-2"><ProgressBar value={done} total={total} /><span className="whitespace-nowrap text-xs text-ink-500">{done}/{total}</span></div></li>;
        })}</ul>}
      </Card>
      <p className="text-xs text-ink-400">Records are counted for the Sales ID that owns them. “Accepted” means the SMTP server took the message, not that it reached the inbox; opens are estimates.</p>
    </div>
  );
}
