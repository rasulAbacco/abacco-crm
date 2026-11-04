import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiPlus, FiSettings, FiList, FiTrello } from 'react-icons/fi';
import { dealService } from './services/dealService';
import DealForm from './components/DealForm';
import PipelineSettings from './components/PipelineSettings';
import { useApi } from '../../hooks/useApi';
import { PageHeader, Loading, ErrorState, Badge } from '../../components/common/ui';
import { formatMoney, formatMoneyList, formatDate, fullName } from '../../utils/format';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

const KIND = { OPEN: 'border-t-brand-600', WON: 'border-t-emerald-500', LOST: 'border-t-red-500' };

export default function DealBoard() {
  const navigate = useNavigate();
  const [pipelineId, setPipelineId] = useState('');
  const [creating, setCreating] = useState(null);
  const [settings, setSettings] = useState(false);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const { data, loading, error, reload, setData } = useApi(() => dealService.board({ pipelineId: pipelineId || undefined }), [pipelineId]);
  const pipelines = useApi(() => dealService.pipelines(), []);

  const drop = async (stage) => {
    setOver(null);
    if (!drag || drag.stageId === stage.id) return;
    const deal = drag;
    // optimistic move
    setData({ ...data, stages: data.stages.map((s) => ({ ...s, deals: s.id === stage.id ? [deal, ...s.deals] : s.deals.filter((d) => d.id !== deal.id) })) });
    try {
      await dealService.move(deal.id, { stageId: stage.id });
      toast(`Moved to ${stage.name}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
    reload();
  };

  return (
    <div>
      <PageHeader title="Deals" subtitle={data?.pipeline ? `Pipeline: ${data.pipeline.name}` : 'Sales pipeline'} actions={<>
        {pipelines.data?.length > 1 && <select className="input w-56" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} aria-label="Pipeline"><option value="">Default pipeline</option>{pipelines.data.map((p) => <option key={p.id} value={p.id}>{p.workspace.code} · {p.name}</option>)}</select>}
        <Link to="/deals/list" className="btn-secondary"><FiList /> List</Link>
        {data && <button className="btn-secondary" onClick={() => setSettings(true)}><FiSettings /> Stages</button>}
        <button className="btn-primary" onClick={() => setCreating({})}><FiPlus /> New deal</button>
      </>} />
      {loading && !data ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="flex gap-3" style={{ minWidth: `${data.stages.length * 272}px` }}>
            {data.stages.map((s) => (
              <div key={s.id} className={`flex w-64 shrink-0 flex-col rounded-xl border border-t-4 bg-ink-100/60 ${KIND[s.kind]} ${over === s.id ? 'ring-2 ring-brand-300' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(s)}>
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">{s.name}</p><Badge>{s.count}</Badge></div>
                  <p className="mt-0.5 truncate text-xs text-ink-500" title={formatMoneyList(s.totals)}>{s.totals.length ? formatMoneyList(s.totals, { compact: true }) : '—'} · {s.probability}%</p>
                </div>
                <div className="flex max-h-[65vh] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {s.deals.map((d) => (
                    <div key={d.id} draggable onDragStart={() => setDrag(d)} onDragEnd={() => setDrag(null)} onClick={() => navigate(`/deals/${d.id}`)}
                      className={`cursor-pointer rounded-lg border border-ink-200 bg-white p-3 shadow-sm hover:border-brand-300 ${drag?.id === d.id ? 'opacity-50' : ''}`}>
                      <p className="text-sm font-medium text-ink-900">{d.title}</p>
                      <p className="mt-1 text-sm font-semibold text-ink-700">{formatMoney(d.amountMinor, d.currency)}</p>
                      <p className="mt-1 truncate text-xs text-ink-500">{d.company?.name ?? (d.contact ? fullName(d.contact) : '')}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-500"><span>{d.expectedCloseDate ? `Close ${formatDate(d.expectedCloseDate)}` : ''}</span><span>{d.ownerWorkspace.code}</span></div>
                    </div>
                  ))}
                  <button className="rounded-lg border border-dashed border-ink-300 py-1.5 text-xs text-ink-500 hover:bg-white" onClick={() => setCreating({ stageId: s.id })}>+ Add deal</button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-ink-500"><FiTrello /> Drag cards between columns to change their stage. Totals are shown per currency.</p>
        </div>
      )}
      {creating && <DealForm open stageId={creating.stageId} pipelineId={data?.pipeline?.id} onClose={() => setCreating(null)} onSaved={reload} />}
      {settings && data && <PipelineSettings open pipelineId={data.pipeline.id} onClose={() => setSettings(false)} onChanged={reload} />}
    </div>
  );
}
