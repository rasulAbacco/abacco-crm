// Follow-ups panel used on lead / contact / company / deal pages.
import { useState } from 'react';
import { FiPlus, FiCheck } from 'react-icons/fi';
import TaskForm from './TaskForm';
import { taskService } from '../services/taskService';
import { StatusBadge, EmptyState } from '../../../components/common/ui';
import { formatDateTime } from '../../../utils/format';
import { toast } from '../../../store/uiStore';
import { errorMessage } from '../../../services/axiosInstance';

export default function TaskQuickAdd({ link, tasks, onChanged }) {
  const [open, setOpen] = useState(false);
  const complete = async (id) => {
    try {
      await taskService.complete(id);
      toast('Task completed');
      onChanged();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <div>
      <div className="mb-3 flex justify-end"><button className="btn-secondary btn-sm" onClick={() => setOpen(true)}><FiPlus /> Add follow-up</button></div>
      {tasks.length === 0 ? <EmptyState title="No follow-ups" /> : (
        <ul className="divide-y divide-ink-100">
          {tasks.map((t) => {
            const overdue = t.dueAt && new Date(t.dueAt) < new Date() && !['DONE', 'CANCELLED'].includes(t.status);
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0"><p className={`truncate text-sm ${t.status === 'DONE' ? 'text-ink-400 line-through' : ''}`}>{t.title}</p><p className={`text-xs ${overdue ? 'text-red-600' : 'text-ink-500'}`}>{t.dueAt ? `Due ${formatDateTime(t.dueAt)}` : 'No due date'}{overdue ? ' · overdue' : ''}</p></div>
                <div className="flex items-center gap-2"><StatusBadge value={t.status} />{t.status !== 'DONE' && <button className="btn-ghost btn-sm" onClick={() => complete(t.id)} aria-label="Complete"><FiCheck /></button>}</div>
              </li>
            );
          })}
        </ul>
      )}
      {open && <TaskForm open link={link} onClose={() => setOpen(false)} onSaved={onChanged} />}
    </div>
  );
}
