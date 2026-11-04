import { useParams, Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import { campaignService } from './services/campaignService';
import { useApi } from '../../hooks/useApi';
import { PageHeader, Loading, ErrorState, Card, StatCard, Alert } from '../../components/common/ui';
import { BarChartBox, DonutBox } from '../../components/charts/Charts';
import { humanize, num, pct } from '../../utils/format';

export default function CampaignAnalytics() {
  const { id } = useParams();
  const { data: s, loading, error, reload } = useApi(() => campaignService.stats(id), [id]);
  if (loading && !s) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const breakdown = Object.entries(s.counts).filter(([, n]) => n).map(([k, n]) => ({ name: humanize(k), count: n }));
  const hourly = s.sentPerHour.map((h) => ({ hour: new Date(h.hour).toLocaleString('en', { day: '2-digit', month: 'short', hour: '2-digit' }), sent: h.sent }));
  const funnel = [{ step: 'Recipients', n: s.total }, { step: 'Accepted', n: s.accepted }, { step: 'Opened (est.)', n: s.uniqueOpens }, { step: 'Clicked', n: s.uniqueClicks }];
  return (
    <div className="space-y-4">
      <PageHeader back={<Link to={`/campaigns/${id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"><FiArrowLeft /> {s.campaign.name}</Link>} title="Campaign analytics" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Accepted by SMTP" value={num(s.accepted)} /><StatCard label="Delivery events (SES)" value={num(s.deliveredEvents)} /><StatCard label="Bounce rate" tone="amber" value={pct(s.rates.bounceRate)} /><StatCard label="Complaints" tone="red" value={num(s.complaints)} />
        <StatCard label="Open rate (estimated)" value={pct(s.rates.openRateEstimated)} /><StatCard label="Click rate" value={pct(s.rates.clickRate)} /><StatCard label="Unsubscribe rate" value={pct(s.rates.unsubscribeRate)} /><StatCard label="Retried" value={num(s.retried)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Engagement funnel"><BarChartBox data={funnel} x="step" bars={[{ key: 'n', label: 'People' }]} /></Card>
        <Card title="Recipient status"><DonutBox data={breakdown} nameKey="name" valueKey="count" /></Card>
        <Card title="Sent per hour" className="lg:col-span-2"><BarChartBox data={hourly} x="hour" bars={[{ key: 'sent', label: 'Accepted' }]} /></Card>
        <Card title="By SMTP account" className="lg:col-span-2"><BarChartBox data={s.perSmtp.map((a) => ({ name: a.name, sent: a.counts.SENT ?? 0, failed: a.counts.FAILED ?? 0, bounced: a.counts.BOUNCED ?? 0 }))} x="name" bars={[{ key: 'sent', label: 'Sent' }, { key: 'failed', label: 'Failed', color: '#ef4444' }, { key: 'bounced', label: 'Bounced', color: '#f59e0b' }]} /></Card>
      </div>
      <Alert tone="blue"><ul className="ml-4 list-disc">{Object.values(s.notes).map((n) => <li key={n}>{n}</li>)}</ul></Alert>
    </div>
  );
}
