import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiFileText, FiCopy, FiTrash2 } from 'react-icons/fi';
import { templateService } from './services/templateService';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/common/DataTable';
import { PageHeader, EmptyState, Badge } from '../../components/common/ui';
import { formatDate } from '../../utils/format';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

export default function TemplateList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi(() => templateService.list({ page }), [page]);
  const act = (p, msg) => p.then(() => { toast(msg); reload(); }).catch((e) => toast(errorMessage(e), 'error'));
  return (
    <div>
      <PageHeader title="Email templates" subtitle="Reusable designs for campaigns" actions={<button className="btn-primary" onClick={() => navigate('/templates/new')}><FiPlus /> New template</button>} />
      <DataTable rows={data} meta={meta} loading={loading} error={error} onRetry={reload} onPage={setPage} onRowClick={(r) => navigate(`/templates/${r.id}`)}
        empty={<EmptyState icon={FiFileText} title="No templates yet" action={<button className="btn-primary" onClick={() => navigate('/templates/new')}><FiPlus /> New template</button>} />}
        columns={[
          { key: 'name', header: 'Template', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-ink-500">{r.subject}</p></div> },
          { key: 'ws', header: 'Available to', render: (r) => (r.ownerWorkspace ? <Badge>{r.ownerWorkspace.code}</Badge> : <Badge tone="blue">All Sales IDs</Badge>) },
          { key: 'updated', header: 'Updated', render: (r) => formatDate(r.updatedAt) },
          { key: 'a', header: '', render: (r) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><button className="btn-ghost btn-sm" onClick={() => act(templateService.duplicate(r.id), 'Duplicated')} aria-label="Duplicate"><FiCopy /></button><button className="btn-ghost btn-sm text-red-700" onClick={() => act(templateService.remove(r.id), 'Deleted')} aria-label="Delete"><FiTrash2 /></button></div> },
        ]} />
    </div>
  );
}
