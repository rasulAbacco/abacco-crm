import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiList } from 'react-icons/fi';
import { listService } from './services/listService';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/common/DataTable';
import { PageHeader, Modal, EmptyState, Badge } from '../../components/common/ui';
import { TextInput, TextArea } from '../../components/forms/fields';
import OwnerSelect from '../../components/forms/OwnerSelect';
import { formatDate, num } from '../../utils/format';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

export default function EmailListList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [v, setV] = useState({ name: '', description: '', owner: '' });
  const { data, meta, loading, error, reload } = useApi(() => listService.list({ page }), [page]);
  const create = async () => {
    try {
      const r = await listService.create({ name: v.name, description: v.description || null, ...(v.owner ? { ownerWorkspaceId: v.owner } : {}) });
      toast('List created');
      navigate(`/email-lists/${r.data.data.id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <div>
      <PageHeader title="Email lists" subtitle="Audiences for campaigns. Unsubscribed and suppressed people are always excluded." actions={<button className="btn-primary" onClick={() => setCreating(true)}><FiPlus /> New list</button>} />
      <DataTable rows={data} meta={meta} loading={loading} error={error} onRetry={reload} onPage={setPage} onRowClick={(r) => navigate(`/email-lists/${r.id}`)}
        empty={<EmptyState icon={FiList} title="No lists yet" action={<button className="btn-primary" onClick={() => setCreating(true)}><FiPlus /> New list</button>} />}
        columns={[
          { key: 'name', header: 'List', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-ink-500">{r.description}</p></div> },
          { key: 'sub', header: 'Subscribed', className: 'text-right', render: (r) => num(r.counts.SUBSCRIBED) },
          { key: 'unsub', header: 'Unsubscribed', className: 'text-right', render: (r) => num(r.counts.UNSUBSCRIBED) },
          { key: 'bounced', header: 'Bounced', className: 'text-right', render: (r) => num(r.counts.BOUNCED) },
          { key: 'ws', header: 'Sales ID', render: (r) => <Badge>{r.ownerWorkspace.code}</Badge> },
          { key: 'created', header: 'Created', render: (r) => formatDate(r.createdAt) },
        ]} />
      <Modal open={creating} onClose={() => setCreating(false)} title="New email list" footer={<><button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" disabled={!v.name} onClick={create}>Create</button></>}>
        <div className="space-y-3"><OwnerSelect value={v.owner} onChange={(owner) => setV({ ...v, owner })} /><TextInput label="Name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /><TextArea label="Description" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      </Modal>
    </div>
  );
}
