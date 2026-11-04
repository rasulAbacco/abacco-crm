// Shared list screen for leads / contacts / companies / deals: search, filters,
// sort, paging, bulk delete / share / transfer, import and export.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiDownload, FiUpload, FiSearch, FiShare2, FiRepeat, FiTrash2, FiFilter } from 'react-icons/fi';
import api, { download, errorMessage } from '../../services/axiosInstance';
import { useApi, useDebounce } from '../../hooks/useApi';
import { toast } from '../../store/uiStore';
import { useSalesIdStore } from '../../store/salesIdStore';
import DataTable from './DataTable';
import { PageHeader, ConfirmDialog, EmptyState } from './ui';
import { ShareTransferModal, ImportModal } from './RecordTools';

export default function RecordListPage({ entity, title, subtitle, columns, filters = [], createLabel, onCreate, importHint, defaultSort = '-createdAt', extraActions, bulkPatch, emptyIcon }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(defaultSort);
  const [f, setF] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const options = useSalesIdStore((s) => s.options);
  const dq = useDebounce(q);
  const params = { q: dq || undefined, page, pageSize: 25, sort, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) };
  const { data, meta, loading, error, reload } = useApi(() => api.get(`/${entity}`, { params }), [JSON.stringify(params)]);
  const setFilter = (k, v) => { setF({ ...f, [k]: v }); setPage(1); };

  const bulkDelete = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/${entity}/bulk-delete`, { ids: selected });
      toast(`${r.data.data.succeeded.length} deleted${r.data.data.failed.length ? `, ${r.data.data.failed.length} not allowed` : ''}`);
      setSelected([]);
      setModal(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const doPatch = async (patch) => {
    try {
      const r = await api.post(`/${entity}/bulk-update`, { ids: selected, patch });
      toast(`${r.data.data.succeeded.length} updated`);
      setSelected([]);
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={<>
        {extraActions}
        {importHint && <button className="btn-secondary" onClick={() => setModal('import')}><FiUpload /> Import</button>}
        <div className="relative">
          <button className="btn-secondary" onClick={() => setModal(modal === 'export' ? null : 'export')}><FiDownload /> Export</button>
          {modal === 'export' && (
            <div className="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
              {['csv', 'xlsx'].map((fmt) => <button key={fmt} className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-50" onClick={() => { setModal(null); download(`/${entity}/export`, { ...params, page: undefined, pageSize: undefined, format: fmt }, `${entity}.${fmt}`).catch((e) => toast(errorMessage(e), 'error')); }}>{fmt === 'csv' ? 'CSV' : 'Excel (.xlsx)'}</button>)}
            </div>
          )}
        </div>
        {onCreate && <button className="btn-primary" onClick={onCreate}><FiPlus /> {createLabel}</button>}
      </>} />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-2.5 text-ink-400" />
          <input className="input pl-9" placeholder={`Search ${title.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        {filters.length > 0 && <button className="btn-secondary sm:hidden" onClick={() => setShowFilters(!showFilters)}><FiFilter /> Filters</button>}
        <div className={`${showFilters ? 'grid' : 'hidden'} grid-cols-2 gap-2 sm:flex`}>
          {filters.map((fl) => (
            <select key={fl.name} className="input sm:w-40" value={f[fl.name] ?? ''} onChange={(e) => setFilter(fl.name, e.target.value)} aria-label={fl.label}>
              <option value="">{fl.label}: all</option>
              {fl.options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
            </select>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-800">{selected.length} selected</span>
          {bulkPatch?.(doPatch)}
          {options.length > 1 && <><button className="btn-secondary btn-sm" onClick={() => setModal('share')}><FiShare2 /> Share</button><button className="btn-secondary btn-sm" onClick={() => setModal('transfer')}><FiRepeat /> Transfer</button></>}
          <button className="btn-secondary btn-sm text-red-700" onClick={() => setModal('delete')}><FiTrash2 /> Delete</button>
          <button className="ml-auto text-xs text-ink-500 hover:underline" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <DataTable columns={columns} rows={data} loading={loading} error={error} onRetry={reload} meta={meta} onPage={setPage} sort={sort} onSort={setSort}
        selectable selected={selected} onSelect={setSelected} onRowClick={(r) => navigate(`/${entity}/${r.id}`)}
        empty={<EmptyState icon={emptyIcon} title={dq || Object.values(f).some(Boolean) ? 'No matches' : `No ${title.toLowerCase()} yet`} description={dq ? 'Try a different search or clear the filters.' : undefined} action={onCreate && !dq ? <button className="btn-primary" onClick={onCreate}><FiPlus /> {createLabel}</button> : null} />} />

      <ConfirmDialog open={modal === 'delete'} title={`Delete ${selected.length} record(s)?`} message="Deleted records disappear from lists and reports. Records shared with you cannot be deleted." confirmLabel="Delete" busy={busy} onConfirm={bulkDelete} onClose={() => setModal(null)} />
      <ShareTransferModal open={modal === 'share' || modal === 'transfer'} mode={modal} entity={entity} ids={selected} onClose={() => setModal(null)} onDone={() => { setSelected([]); reload(); }} />
      {importHint && <ImportModal open={modal === 'import'} onClose={() => setModal(null)} url={`/${entity}/import`} title={`Import ${title.toLowerCase()}`} columnsHint={importHint} onDone={reload} />}
    </div>
  );
}
