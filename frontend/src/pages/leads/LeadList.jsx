import { useNavigate } from 'react-router-dom';
import { FiUserPlus } from 'react-icons/fi';
import RecordListPage from '../../components/common/RecordListPage';
import { StatusBadge } from '../../components/common/ui';
import { OwnerBadge } from '../../components/common/RecordTools';
import { LEAD_STATUSES, PRIORITIES, LEAD_SOURCES, COUNTRIES } from '../../constants/options';
import { formatDate, humanize } from '../../utils/format';

export default function LeadList() {
  const navigate = useNavigate();
  return (
    <RecordListPage
      entity="leads" title="Leads" subtitle="Prospects before they become contacts and deals" createLabel="New lead" onCreate={() => navigate('/leads/new')} emptyIcon={FiUserPlus}
      importHint="Columns: First Name, Last Name, Email, Phone, Company, Designation, Website, Country (2-letter), City, Source, Status, Priority"
      filters={[
        { name: 'status', label: 'Status', options: LEAD_STATUSES.map((s) => [s, humanize(s)]) },
        { name: 'priority', label: 'Priority', options: PRIORITIES.map((s) => [s, humanize(s)]) },
        { name: 'source', label: 'Source', options: LEAD_SOURCES },
        { name: 'countryCode', label: 'Country', options: COUNTRIES },
      ]}
      bulkPatch={(patch) => (
        <select className="input w-auto py-1 text-xs" defaultValue="" onChange={(e) => e.target.value && patch({ status: e.target.value })} aria-label="Set status">
          <option value="">Set status…</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
      )}
      columns={[
        { key: 'fullName', header: 'Name', sort: 'fullName', render: (r) => <div><p className="font-medium text-ink-900">{r.fullName}</p><p className="text-xs text-ink-500">{r.email ?? r.phoneE164 ?? r.phoneRaw ?? ''}</p></div> },
        { key: 'companyName', header: 'Company', sort: 'companyName', render: (r) => r.company?.name ?? r.companyName ?? '—' },
        { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge value={r.status} /> },
        { key: 'priority', header: 'Priority', sort: 'priority', render: (r) => <StatusBadge value={r.priority} /> },
        { key: 'score', header: 'Score', sort: 'score', className: 'text-right', render: (r) => <span className="tabular-nums">{r.score}</span> },
        { key: 'source', header: 'Source', render: (r) => r.source ?? '—' },
        { key: 'countryCode', header: 'Country', render: (r) => r.countryCode ?? '—' },
        { key: 'owner', header: 'Sales ID', render: (r) => <OwnerBadge record={r} /> },
        { key: 'createdAt', header: 'Created', sort: 'createdAt', render: (r) => formatDate(r.createdAt) },
      ]}
    />
  );
}
