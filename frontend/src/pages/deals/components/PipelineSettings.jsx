import { useEffect, useState } from 'react';
import { FiArrowUp, FiArrowDown, FiTrash2, FiPlus } from 'react-icons/fi';
import { Modal, Spinner, Alert } from '../../../components/common/ui';
import { dealService } from '../services/dealService';
import { errorMessage } from '../../../services/axiosInstance';
import { toast } from '../../../store/uiStore';

export default function PipelineSettings({ open, onClose, pipelineId, onChanged }) {
  const [p, setP] = useState(null);
  const [name, setName] = useState('');
  const load = () => dealService.pipelines().then((r) => setP(r.data.data.find((x) => x.id === pipelineId)));
  useEffect(() => { if (open) load(); }, [open, pipelineId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn, msg) => {
    try {
      await fn();
      if (msg) toast(msg);
      await load();
      onChanged?.();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const move = (i, d) => {
    const ids = p.stages.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => dealService.reorder(p.id, ids));
  };
  const remove = (s) => {
    const others = p.stages.filter((x) => x.id !== s.id);
    run(() => dealService.deleteStage(p.id, s.id, { moveToStageId: others.find((x) => x.kind === s.kind)?.id ?? others[0]?.id }), 'Stage deleted; its deals moved to a similar stage');
  };
  return (
    <Modal open={open} onClose={onClose} title="Pipeline stages" footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      {!p ? <Spinner /> : (
        <div className="space-y-3">
          <Alert tone="blue">Stage type decides the deal status: Open, Won or Lost.</Alert>
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {p.stages.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input className="input flex-1 py-1.5" defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && run(() => dealService.updateStage(p.id, s.id, { name: e.target.value }), 'Renamed')} aria-label="Stage name" />
                <input className="input w-20 py-1.5" type="number" min={0} max={100} defaultValue={s.probability} onBlur={(e) => Number(e.target.value) !== s.probability && run(() => dealService.updateStage(p.id, s.id, { probability: Number(e.target.value) }))} aria-label="Probability" />
                <select className="input w-28 py-1.5" value={s.kind} onChange={(e) => run(() => dealService.updateStage(p.id, s.id, { kind: e.target.value }))} aria-label="Stage type"><option value="OPEN">Open</option><option value="WON">Won</option><option value="LOST">Lost</option></select>
                <button className="btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><FiArrowUp /></button>
                <button className="btn-ghost btn-sm" disabled={i === p.stages.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><FiArrowDown /></button>
                <button className="btn-ghost btn-sm text-red-700" disabled={p.stages.length <= 1} onClick={() => remove(s)} aria-label="Delete stage"><FiTrash2 /></button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2"><input className="input" placeholder="New stage name" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn-secondary" disabled={!name.trim()} onClick={() => run(() => dealService.addStage(p.id, { name: name.trim(), probability: 50 }), 'Stage added').then(() => setName(''))}><FiPlus /> Add</button></div>
        </div>
      )}
    </Modal>
  );
}
