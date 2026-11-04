import { useState } from 'react';
import { Modal, Spinner } from '../../../components/common/ui';
import { FormGrid } from '../../../components/forms/fields';
import OwnerSelect from '../../../components/forms/OwnerSelect';
import { RecordPicker } from '../../../components/common/RecordTools';
import { TASK_TYPES, TASK_STATUSES, PRIORITIES } from '../../../constants/options';
import { taskService } from '../services/taskService';
import { errorMessage, fieldErrors } from '../../../services/axiosInstance';
import { toast } from '../../../store/uiStore';
import { toLocalInput, fromLocalInput } from '../../../utils/format';

export default function TaskForm({ open, onClose, task, link = {}, onSaved }) {
  const [v, setV] = useState({
    title: task?.title ?? '', description: task?.description ?? '', type: task?.type ?? 'FOLLOW_UP', status: task?.status ?? 'TODO', priority: task?.priority ?? 'MEDIUM',
    dueAt: toLocalInput(task?.dueAt), remindAt: toLocalInput(task?.remindAt), leadId: task?.leadId ?? link.leadId ?? null, contactId: task?.contactId ?? link.contactId ?? null,
    dealId: task?.dealId ?? link.dealId ?? null, companyId: task?.companyId ?? link.companyId ?? null,
  });
  const [owner, setOwner] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...v, description: v.description || null, dueAt: fromLocalInput(v.dueAt), remindAt: fromLocalInput(v.remindAt) };
      if (task) await taskService.update(task.id, body);
      else await taskService.create({ ...body, ...(owner ? { ownerWorkspaceId: owner } : {}) });
      toast(task ? 'Task saved' : 'Task created');
      onSaved?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const linked = Object.values(link).some(Boolean);
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'} size="lg" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !v.title.trim()} onClick={save}>{busy && <Spinner className="h-4 w-4" />}Save</button></>}>
      {!task && <div className="mb-4 max-w-sm"><OwnerSelect value={owner} onChange={setOwner} /></div>}
      <FormGrid values={v} errors={errors} onChange={setV} fields={[
        { name: 'title', label: 'Title', required: true, span: 2 },
        { name: 'type', label: 'Type', type: 'select', options: TASK_TYPES, placeholder: false }, { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, placeholder: false },
        { name: 'dueAt', label: 'Due', type: 'datetime-local' }, { name: 'remindAt', label: 'Remind me at', type: 'datetime-local', hint: 'In-app notification' },
        task && { name: 'status', label: 'Status', type: 'select', options: TASK_STATUSES, placeholder: false },
        !linked && { name: 'leadId', render: (x, set) => <RecordPicker label="Lead" endpoint="/leads" value={x.leadId} onChange={(id) => set({ ...x, leadId: id })} display={(r) => r.fullName} /> },
        !linked && { name: 'contactId', render: (x, set) => <RecordPicker label="Contact" endpoint="/contacts" value={x.contactId} onChange={(id) => set({ ...x, contactId: id })} display={(r) => [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email} /> },
        !linked && { name: 'dealId', render: (x, set) => <RecordPicker label="Deal" endpoint="/deals" value={x.dealId} onChange={(id) => set({ ...x, dealId: id })} display={(r) => r.title} /> },
        { name: 'description', label: 'Details', type: 'textarea', span: 2 },
      ]} />
    </Modal>
  );
}
