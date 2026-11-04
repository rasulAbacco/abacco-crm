import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiPlus, FiList, FiCalendar, FiCheck, FiTrash2 } from 'react-icons/fi';
import { taskService } from './services/taskService';
import TaskForm from './components/TaskForm';
import TaskCalendar from './components/TaskCalendar';
import { useApi } from '../../hooks/useApi';
import DataTable from '../../components/common/DataTable';
import { PageHeader, StatusBadge, Tabs, EmptyState } from '../../components/common/ui';
import { formatDateTime, fullName } from '../../utils/format';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

const VIEWS = [{ value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'done', label: 'Completed' }];

export default function TaskList() {
  const [params] = useSearchParams();
  const [view, setView] = useState('open');
  const [mode, setMode] = useState('list');
  const [page, setPage] = useState(1);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [editing, setEditing] = useState(params.get('open') ? { id: params.get('open'), _load: true } : null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState([]);
  const q = mode === 'calendar'
    ? { from: new Date(month.getFullYear(), month.getMonth(), -7).toISOString(), to: new Date(month.getFullYear(), month.getMonth() + 1, 7).toISOString(), pageSize: 500 }
    : { page, pageSize: 25, ...(view === 'done' ? { status: 'DONE', sort: '-dueAt' } : { status: 'TODO,IN_PROGRESS', ...(view !== 'open' ? { due: view } : {}) }) };
  const { data, meta, loading, error, reload } = useApi(() => taskService.list(q), [JSON.stringify(q)]);
  const editingTask = editing?._load ? data?.find((t) => t.id === editing.id) : editing;

  const act = async (fn, msg) => {
    try {
      await fn();
      toast(msg);
      setSelected([]);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const related = (t) => (t.lead ? `Lead: ${t.lead.fullName}` : t.contact ? `Contact: ${fullName(t.contact)}` : t.deal ? `Deal: ${t.deal.title}` : t.company ? `Company: ${t.company.name}` : '—');

  return (
    <div>
      <PageHeader title="Tasks & follow-ups" subtitle="Calls, meetings and reminders linked to your records" actions={<>
        <div className="flex rounded-lg border border-ink-300 bg-white p-0.5">
          <button className={`btn-sm rounded-md px-2 py-1 ${mode === 'list' ? 'bg-ink-100' : ''}`} onClick={() => setMode('list')} aria-label="List view"><FiList /></button>
          <button className={`btn-sm rounded-md px-2 py-1 ${mode === 'calendar' ? 'bg-ink-100' : ''}`} onClick={() => setMode('calendar')} aria-label="Calendar view"><FiCalendar /></button>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}><FiPlus /> New task</button>
      </>} />
      {mode === 'calendar' ? <TaskCalendar month={month} onMonth={setMonth} tasks={data ?? []} onOpen={setEditing} /> : (
        <>
          <Tabs tabs={VIEWS} value={view} onChange={(v) => { setView(v); setPage(1); setSelected([]); }} />
          {selected.length > 0 && <div className="mb-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm"><span>{selected.length} selected</span><button className="btn-secondary btn-sm" onClick={() => act(() => taskService.bulkStatus({ ids: selected, status: 'DONE' }), 'Marked complete')}><FiCheck /> Complete</button><button className="btn-secondary btn-sm" onClick={() => act(() => taskService.bulkStatus({ ids: selected, status: 'CANCELLED' }), 'Cancelled')}>Cancel tasks</button></div>}
          <DataTable rows={data} meta={meta} loading={loading} error={error} onRetry={reload} onPage={setPage} selectable selected={selected} onSelect={setSelected} onRowClick={setEditing}
            empty={<EmptyState title={view === 'overdue' ? 'Nothing overdue' : 'No tasks here'} />}
            columns={[
              { key: 'title', header: 'Task', render: (t) => <div><p className="font-medium text-ink-900">{t.title}</p><p className="text-xs text-ink-500">{related(t)}</p></div> },
              { key: 'type', header: 'Type', render: (t) => <StatusBadge value={t.type} /> },
              { key: 'priority', header: 'Priority', render: (t) => <StatusBadge value={t.priority} /> },
              { key: 'dueAt', header: 'Due', render: (t) => <span className={t.dueAt && new Date(t.dueAt) < new Date() && t.status !== 'DONE' ? 'text-red-600' : ''}>{t.dueAt ? formatDateTime(t.dueAt) : '—'}</span> },
              { key: 'status', header: 'Status', render: (t) => <StatusBadge value={t.status} /> },
              { key: 'ws', header: 'Sales ID', render: (t) => t.ownerWorkspace?.code },
              { key: 'a', header: '', render: (t) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>{t.status !== 'DONE' && <button className="btn-ghost btn-sm" onClick={() => act(() => taskService.complete(t.id), 'Completed')} aria-label="Complete"><FiCheck /></button>}<button className="btn-ghost btn-sm text-red-700" onClick={() => act(() => taskService.remove(t.id), 'Deleted')} aria-label="Delete"><FiTrash2 /></button></div> },
            ]} />
        </>
      )}
      {creating && <TaskForm open onClose={() => setCreating(false)} onSaved={reload} />}
      {editingTask && <TaskForm open task={editingTask} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}
