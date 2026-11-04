import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiZap } from 'react-icons/fi';
import { automationService } from './services/automationService';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/common/DataTable';
import { PageHeader, StatusBadge, EmptyState, Badge } from '../../components/common/ui';
import { formatDate, humanize } from '../../utils/format';

export default function AutomationList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi(() => automationService.list({ page }), [page]);
  return (
    <div>
      <PageHeader title="Automations" subtitle="Welcome emails, follow-up sequences and tasks triggered by CRM events" actions={<button className="btn-primary" onClick={() => navigate('/automations/new')}><FiPlus /> New automation</button>} />
      <DataTable rows={data} meta={meta} loading={loading} error={error} onRetry={reload} onPage={setPage} onRowClick={(r) => navigate(`/automations/${r.id}`)}
        empty={<EmptyState icon={FiZap} title="No automations yet" action={<button className="btn-primary" onClick={() => navigate('/automations/new')}><FiPlus /> New automation</button>} />}
        columns={[
          { key: 'name', header: 'Automation', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-ink-500">{r.description}</p></div> },
          { key: 'trigger', header: 'Trigger', render: (r) => humanize(r.triggerType) },
          { key: 'steps', header: 'Steps', render: (r) => r.steps.length },
          { key: 'enrolled', header: 'People enrolled', render: (r) => r._count.enrollments },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'ws', header: 'Sales ID', render: (r) => <Badge>{r.ownerWorkspace.code}</Badge> },
          { key: 'created', header: 'Created', render: (r) => formatDate(r.createdAt) },
        ]} />
    </div>
  );
}
