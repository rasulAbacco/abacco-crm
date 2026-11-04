import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiStar, FiSearch } from 'react-icons/fi';
import { salesIdService } from './services/salesIdService';
import SalesIdForm from './components/SalesIdForm';
import { useApi, useDebounce } from '../../hooks/useApi';
import { useSalesIdStore } from '../../store/salesIdStore';
import DataTable from '../../components/common/DataTable';
import { PageHeader, StatusBadge, Badge } from '../../components/common/ui';
import { formatMoneyList, formatDate } from '../../utils/format';

export default function SalesIdList() {
  const navigate = useNavigate();
  const select = useSalesIdStore((s) => s.select);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const dq = useDebounce(q);
  const { data, meta, loading, error, reload } = useApi(() => salesIdService.list({ q: dq || undefined, status: status || undefined, pageSize: 100 }), [dq, status]);
  return (
    <div>
      <PageHeader title="Sales IDs" subtitle="Independent sales workspaces under your account. Each has its own records, campaigns and SMTP accounts." actions={<button className="btn-primary" onClick={() => setCreating(true)}><FiPlus /> New Sales ID</button>} />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><FiSearch className="absolute left-3 top-2.5 text-ink-400" /><input className="input pl-9" placeholder="Search Sales IDs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
      </div>
      <DataTable rows={data} meta={meta} loading={loading} error={error} onRetry={reload} onRowClick={(r) => navigate(`/sales-ids/${r.id}`)}
        columns={[
          { key: 'code', header: 'Sales ID', render: (r) => <div className="flex items-center gap-2">{r.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />}<div><p className="font-medium text-ink-900">{r.code} {r.isDefault && <Badge tone="blue"><FiStar className="mr-1" />Default</Badge>}</p><p className="text-xs text-ink-500">{r.name}</p></div></div> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'leads', header: 'Leads', className: 'text-right', render: (r) => r.stats.leads },
          { key: 'contacts', header: 'Contacts', className: 'text-right', render: (r) => r.stats.contacts },
          { key: 'deals', header: 'Open deals', className: 'text-right', render: (r) => r.stats.openDeals },
          { key: 'pipeline', header: 'Pipeline', render: (r) => <span className="whitespace-nowrap">{formatMoneyList(r.stats.pipelineValue, { compact: true })}</span> },
          { key: 'won', header: 'Won revenue', render: (r) => <span className="whitespace-nowrap">{formatMoneyList(r.stats.wonRevenue, { compact: true })}</span> },
          { key: 'campaigns', header: 'Campaigns', className: 'text-right', render: (r) => r.stats.campaigns },
          { key: 'smtp', header: 'SMTP', className: 'text-right', render: (r) => r.stats.smtpAccounts },
          { key: 'created', header: 'Created', render: (r) => formatDate(r.createdAt) },
          { key: 'open', header: '', render: (r) => <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); select(r.id); navigate('/'); }}>Switch to</button> },
        ]} />
      {creating && <SalesIdForm open onClose={() => setCreating(false)} onSaved={reload} />}
    </div>
  );
}
