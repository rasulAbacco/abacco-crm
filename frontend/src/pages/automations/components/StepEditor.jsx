import { FiArrowUp, FiArrowDown, FiTrash2, FiMail, FiClock, FiCheckSquare, FiEdit } from 'react-icons/fi';
import EmailEditor from '../../../components/forms/EmailEditor';
import { TextInput, Select } from '../../../components/forms/fields';
import { LEAD_STATUSES, PRIORITIES } from '../../../constants/options';

export const STEP_TYPES = {
  SEND_EMAIL: { label: 'Send email', icon: FiMail, config: { subject: '', html: '<p>Hi {{firstName|there}},</p><p></p>' } },
  WAIT: { label: 'Wait', icon: FiClock, config: { amount: 1, unit: 'days' } },
  CREATE_TASK: { label: 'Create follow-up task', icon: FiCheckSquare, config: { title: 'Follow up', dueInDays: 1, priority: 'MEDIUM' } },
  UPDATE_FIELD: { label: 'Update lead field', icon: FiEdit, config: { field: 'status', value: 'CONTACTED' } },
};

export default function StepEditor({ step, index, total, onChange, onMove, onRemove, disabled }) {
  const T = STEP_TYPES[step.type];
  const set = (patch) => onChange({ ...step, config: { ...step.config, ...patch } });
  return (
    <div className="rounded-lg border border-ink-200 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs text-brand-800">{index + 1}</span><T.icon className="text-ink-500" />{T.label}</span>
        {!disabled && <span className="flex gap-1">
          <button className="btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><FiArrowUp /></button>
          <button className="btn-ghost btn-sm" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down"><FiArrowDown /></button>
          <button className="btn-ghost btn-sm text-red-700" onClick={onRemove} aria-label="Remove step"><FiTrash2 /></button>
        </span>}
      </div>
      <fieldset disabled={disabled} className="space-y-3 p-3">
        {step.type === 'SEND_EMAIL' && <><TextInput label="Subject" value={step.config.subject} onChange={(e) => set({ subject: e.target.value })} /><EmailEditor value={step.config.html} onChange={(html) => set({ html })} height={220} /></>}
        {step.type === 'WAIT' && <div className="flex gap-2"><TextInput className="w-28" label="Wait" type="number" min={1} value={step.config.amount} onChange={(e) => set({ amount: Number(e.target.value) })} /><Select className="w-36" label="Unit" placeholder={false} value={step.config.unit} onChange={(e) => set({ unit: e.target.value })} options={[['minutes', 'Minutes'], ['hours', 'Hours'], ['days', 'Days']]} /></div>}
        {step.type === 'CREATE_TASK' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><TextInput className="sm:col-span-2" label="Task title" value={step.config.title} onChange={(e) => set({ title: e.target.value })} /><TextInput label="Due in (days)" type="number" min={0} value={step.config.dueInDays} onChange={(e) => set({ dueInDays: Number(e.target.value) })} /><Select label="Priority" placeholder={false} value={step.config.priority} onChange={(e) => set({ priority: e.target.value })} options={PRIORITIES} /></div>}
        {step.type === 'UPDATE_FIELD' && <div className="grid grid-cols-2 gap-3"><Select label="Field" placeholder={false} value={step.config.field} onChange={(e) => set({ field: e.target.value, value: e.target.value === 'status' ? 'CONTACTED' : 'HIGH' })} options={[['status', 'Lead status'], ['priority', 'Lead priority']]} /><Select label="New value" placeholder={false} value={step.config.value} onChange={(e) => set({ value: e.target.value })} options={step.config.field === 'status' ? LEAD_STATUSES : PRIORITIES} /></div>}
      </fieldset>
    </div>
  );
}
