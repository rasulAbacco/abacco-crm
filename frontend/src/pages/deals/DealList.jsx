import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiTrello } from 'react-icons/fi';
import RecordListPage from '../../components/common/RecordListPage';
import { StatusBadge } from '../../components/common/ui';
import { OwnerBadge } from '../../components/common/RecordTools';
import DealForm from './components/DealForm';
import { CURRENCIES } from '../../constants/options';
import { formatMoney, formatDate } from '../../utils/format';

export default function DealList() {
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <RecordListPage entity="deals" title="Deals" subtitle="All deals as a list" createLabel="New deal" onCreate={() => setCreating(true)} emptyIcon={FiTrello}
        extraActions={<Link to="/deals" className="btn-secondary"><FiTrello /> Board</Link>}
        filters={[{ name: 'status', label: 'Status', options: [['OPEN', 'Open'], ['WON', 'Won'], ['LOST', 'Lost']] }, { name: 'currency', label: 'Currency', options: CURRENCIES }]}
        columns={[
          { key: 'title', header: 'Deal', sort: 'title', render: (r) => <span className="font-medium text-ink-900">{r.title}</span> },
          { key: 'amount', header: 'Amount', sort: 'amountMinor', className: 'text-right', render: (r) => <span className="tabular-nums">{formatMoney(r.amountMinor, r.currency)}</span> },
          { key: 'stage', header: 'Stage', render: (r) => r.stage?.name },
          { key: 'status', header: 'Status', sort: 'status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'company', header: 'Company', render: (r) => r.company?.name ?? '—' },
          { key: 'close', header: 'Expected close', sort: 'expectedCloseDate', render: (r) => (r.expectedCloseDate ? formatDate(r.expectedCloseDate) : '—') },
          { key: 'owner', header: 'Sales ID', render: (r) => <OwnerBadge record={r} /> },
        ]} />
      {creating && <DealForm open onClose={() => setCreating(false)} onSaved={(d) => navigate(`/deals/${d.id}`)} />}
    </>
  );
}
