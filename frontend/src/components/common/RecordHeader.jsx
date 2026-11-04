// Header + action bar for a record details page.
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft, FiEdit2, FiShare2, FiRepeat, FiTrash2 } from 'react-icons/fi';
import api, { errorMessage } from '../../services/axiosInstance';
import { toast } from '../../store/uiStore';
import { PageHeader, ConfirmDialog, Badge } from './ui';
import { ShareTransferModal } from './RecordTools';

export default function RecordHeader({ entity, record, title, subtitle, onEdit, onChanged, backTo, backLabel, extra }) {
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const canEdit = ['ACCOUNT', 'OWNER', 'COLLABORATE'].includes(record.access);
  const canManage = ['ACCOUNT', 'OWNER'].includes(record.access);
  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/${entity}/${record.id}`);
      toast('Deleted');
      navigate(backTo);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        back={<Link to={backTo} className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900"><FiArrowLeft /> {backLabel}</Link>}
        title={title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{subtitle}<Badge tone={record.access === 'READ' ? 'amber' : 'gray'}>Owner: {record.ownerWorkspace?.code}</Badge>{record.access === 'READ' && <Badge tone="amber">Shared · view only</Badge>}{record.access === 'COLLABORATE' && <Badge tone="indigo">Shared · can edit</Badge>}{record.shares?.length > 0 && <Badge tone="indigo">Shared with {record.shares.map((s) => s.targetWorkspace.code).join(', ')}</Badge>}</span>}
        actions={<>
          {extra}
          {canEdit && onEdit && <button className="btn-secondary" onClick={onEdit}><FiEdit2 /> Edit</button>}
          {canManage && <><button className="btn-secondary" onClick={() => setModal('share')}><FiShare2 /> Share</button><button className="btn-secondary" onClick={() => setModal('transfer')}><FiRepeat /> Transfer</button><button className="btn-secondary text-red-700" onClick={() => setModal('delete')} aria-label="Delete"><FiTrash2 /></button></>}
        </>}
      />
      <ShareTransferModal open={modal === 'share' || modal === 'transfer'} mode={modal} entity={entity} ids={[record.id]} ownerId={record.ownerWorkspaceId} onClose={() => setModal(null)} onDone={onChanged} />
      <ConfirmDialog open={modal === 'delete'} title="Delete this record?" message="It will be removed from lists and reports. Notes and history are kept in the audit log." confirmLabel="Delete" busy={busy} onConfirm={remove} onClose={() => setModal(null)} />
    </>
  );
}
