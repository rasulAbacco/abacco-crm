// Sharing / transfer / import / timeline components used by every record module.
import { useEffect, useState } from 'react';
import { FiShare2, FiRepeat, FiTrash2, FiUpload, FiMessageSquare, FiPhone, FiMail, FiUsers } from 'react-icons/fi';
import api, { errorMessage } from '../../services/axiosInstance';
import { recordsApi, notesApi } from '../../services/commonService';
import { useSalesIdStore } from '../../store/salesIdStore';
import { toast } from '../../store/uiStore';
import { Modal, Badge, Spinner, Alert, EmptyState } from './ui';
import { Select, Checkbox, Field } from '../forms/fields';
import { formatDateTime, formatRelative, humanize } from '../../utils/format';
import { useDebounce } from '../../hooks/useApi';

export function OwnerBadge({ record }) {
  if (!record?.ownerWorkspace) return null;
  return <Badge tone={record.isShared ? 'indigo' : 'gray'} className="whitespace-nowrap">{record.ownerWorkspace.code}{record.isShared ? ' · shared' : ''}</Badge>;
}

/** entity: leads | contacts | companies | deals; ids: one or many */
export function ShareTransferModal({ open, onClose, entity, ids, mode, ownerId, onDone }) {
  const options = useSalesIdStore((s) => s.options).filter((o) => o.status === 'ACTIVE' && o.id !== ownerId);
  const [targets, setTargets] = useState([]);
  const [target, setTarget] = useState('');
  const [permission, setPermission] = useState('READ');
  const [cascade, setCascade] = useState({ tasks: true, deals: false, contacts: false });
  const [shareBack, setShareBack] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [shares, setShares] = useState(null);
  const single = ids.length === 1;
  useEffect(() => {
    if (open && single && mode === 'share') recordsApi.shares(entity, ids[0]).then((r) => setShares(r.data.data)).catch(() => setShares(null));
    if (!open) { setTargets([]); setTarget(''); setReason(''); }
  }, [open, entity, ids, mode, single]);

  const submit = async () => {
    setBusy(true);
    try {
      let res;
      if (mode === 'share') {
        res = single ? await recordsApi.share(entity, ids[0], { targetWorkspaceIds: targets, permission }) : await recordsApi.bulkShare(entity, { ids, targetWorkspaceIds: targets, permission });
      } else {
        const body = { targetWorkspaceId: target, reason: reason || undefined, cascade, ...(shareBack ? { shareBack } : {}) };
        res = single ? await recordsApi.transfer(entity, ids[0], body) : await recordsApi.bulkTransfer(entity, { ids, ...body });
      }
      const failed = res.data.data?.failed ?? [];
      toast(failed.length ? `${ids.length - failed.length} done, ${failed.length} failed: ${failed[0].message}` : mode === 'share' ? 'Sharing updated' : 'Transferred', failed.length ? 'error' : 'success');
      onDone?.();
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (wsId) => {
    try {
      await recordsApi.revoke(entity, ids[0], wsId);
      setShares((await recordsApi.shares(entity, ids[0])).data.data);
      toast('Access removed');
      onDone?.();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const ready = mode === 'share' ? targets.length > 0 : !!target;
  return (
    <Modal open={open} onClose={onClose} title={`${mode === 'share' ? 'Share' : 'Transfer'} ${single ? 'record' : `${ids.length} records`}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!ready || busy} onClick={submit}>{busy && <Spinner className="h-4 w-4" />}{mode === 'share' ? 'Share' : 'Transfer'}</button></>}>
      {options.length === 0 ? <Alert>Create another active Sales ID first.</Alert> : mode === 'share' ? (
        <div className="space-y-4">
          <Field label="Share with">
            <div className="space-y-1.5 rounded-lg border border-ink-200 p-2">
              {options.map((o) => <Checkbox key={o.id} label={`${o.code} · ${o.name}`} checked={targets.includes(o.id)} onChange={(e) => setTargets(e.target.checked ? [...targets, o.id] : targets.filter((t) => t !== o.id))} />)}
            </div>
          </Field>
          <Select label="Access" value={permission} onChange={(e) => setPermission(e.target.value)} placeholder={false} options={[['READ', 'View only'], ['COLLABORATE', 'View and edit']]} hint="The owner keeps the record; only the owner can transfer or delete it." />
          {shares?.active?.length > 0 && (
            <div><p className="label">Currently shared with</p>
              <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">{shares.active.map((s) => <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm"><span>{s.targetWorkspace.code} · {s.targetWorkspace.name} <Badge>{s.permission === 'READ' ? 'View only' : 'Can edit'}</Badge></span><button className="text-xs text-red-700 hover:underline" onClick={() => revoke(s.targetWorkspace.id)}>Remove</button></li>)}</ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Select label="Move to Sales ID" required value={target} onChange={(e) => setTarget(e.target.value)} options={options.map((o) => [o.id, `${o.code} · ${o.name}`])} />
          <Field label="Also move"><div className="space-y-1.5">
            <Checkbox label="Related tasks" checked={cascade.tasks} onChange={(e) => setCascade({ ...cascade, tasks: e.target.checked })} />
            {entity !== 'deals' && <Checkbox label="Related deals" checked={cascade.deals} onChange={(e) => setCascade({ ...cascade, deals: e.target.checked })} />}
            {entity === 'companies' && <Checkbox label="The company's contacts" checked={cascade.contacts} onChange={(e) => setCascade({ ...cascade, contacts: e.target.checked })} />}
          </div></Field>
          <Select label="Keep access for the current owner" value={shareBack} onChange={(e) => setShareBack(e.target.value)} placeholder="No" options={[['READ', 'Yes, view only'], ['COLLABORATE', 'Yes, view and edit']]} />
          <Field label="Reason (optional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
          <p className="text-xs text-ink-500">Notes, activities and history stay with the record. The transfer is recorded in the audit log.</p>
        </div>
      )}
    </Modal>
  );
}

export function ImportModal({ open, onClose, url, title, columnsHint, extra, onDone, noOwner }) {
  const [file, setFile] = useState(null);
  const [update, setUpdate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const selectedId = useSalesIdStore((s) => s.selected);
  const selected = noOwner ? 'single' : selectedId;
  const options = useSalesIdStore((s) => s.options);
  const [ws, setWs] = useState('');
  useEffect(() => { if (!open) { setFile(null); setResult(null); } }, [open]);
  const submit = async () => {
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      const res = await api.post(url, fd, { params: { updateExisting: update, ...(selected === 'all' && ws ? { ownerWorkspaceId: ws } : {}), ...(extra ?? {}) } });
      setResult(res.data.data);
      onDone?.();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} footer={result ? <button className="btn-primary" onClick={onClose}>Done</button> : <><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!file || busy || (selected === 'all' && !ws)} onClick={submit}>{busy && <Spinner className="h-4 w-4" />}<FiUpload /> Import</button></>}>
      {result ? (
        <div className="space-y-3">
          <Alert tone={result.errorCount ? 'amber' : 'green'}>{result.createdCount} created · {result.updatedCount} updated · {result.skippedCount} skipped (duplicates) · {result.errorCount} with errors</Alert>
          {result.errors?.length > 0 && <ul className="max-h-48 overflow-y-auto rounded border border-ink-200 p-2 text-xs text-ink-700">{result.errors.map((e, i) => <li key={i}>Row {e.line}: {e.message}</li>)}</ul>}
        </div>
      ) : (
        <div className="space-y-4">
          {selected === 'all' && <Select label="Import into Sales ID" required value={ws} onChange={(e) => setWs(e.target.value)} options={options.filter((o) => o.status === 'ACTIVE').map((o) => [o.id, `${o.code} · ${o.name}`])} />}
          <Field label="CSV or Excel (.xlsx) file, max 10,000 rows" hint={columnsHint}><input type="file" accept=".csv,.xlsx" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <Checkbox label="Update existing records with the same email" checked={update} onChange={(e) => setUpdate(e.target.checked)} />
        </div>
      )}
    </Modal>
  );
}

const ACT_ICON = { CALL: FiPhone, EMAIL: FiMail, MEETING: FiUsers, NOTE: FiMessageSquare, SHARE: FiShare2, TRANSFER: FiRepeat };

export function RecordTimeline({ entity, entityType, id, canEdit }) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('NOTE');
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/${entity}/${id}/timeline`).then((r) => setData(r.data.data)).catch(() => setData({ notes: [], activities: [], transfers: [] }));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      if (kind === 'NOTE') await notesApi.create({ entityType, entityId: id, body: note });
      else await notesApi.logActivity({ entityType, entityId: id, type: kind, subject: `${humanize(kind)} logged`, body: note });
      setNote('');
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  const del = async (nid) => { await notesApi.remove(nid).catch((e) => toast(errorMessage(e), 'error')); load(); };
  if (!data) return <div className="py-6"><Spinner /></div>;
  const items = [...data.notes.map((n) => ({ ...n, kind: 'note', at: n.createdAt })), ...data.activities.map((a) => ({ ...a, kind: 'activity', at: a.occurredAt }))].sort((a, b) => new Date(b.at) - new Date(a.at));
  return (
    <div>
      {canEdit && (
        <div className="mb-4 rounded-lg border border-ink-200 p-3">
          <div className="mb-2 flex gap-1">{['NOTE', 'CALL', 'EMAIL', 'MEETING'].map((k) => <button key={k} className={`btn-sm rounded-md px-2 py-1 text-xs ${kind === k ? 'bg-brand-50 text-brand-800' : 'text-ink-500 hover:bg-ink-100'}`} onClick={() => setKind(k)}>{k === 'NOTE' ? 'Note' : `Log ${k.toLowerCase()}`}</button>)}</div>
          <textarea className="input" rows={2} placeholder={kind === 'NOTE' ? 'Write a note…' : 'What happened?'} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex justify-end"><button className="btn-primary btn-sm" disabled={busy || !note.trim()} onClick={add}>Save</button></div>
        </div>
      )}
      {items.length === 0 ? <EmptyState title="No activity yet" /> : (
        <ol className="space-y-3">
          {items.map((it) => {
            const Icon = it.kind === 'note' ? FiMessageSquare : ACT_ICON[it.type] ?? FiRepeat;
            return (
              <li key={`${it.kind}-${it.id}`} className="flex gap-3">
                <div className="mt-0.5 rounded-full bg-ink-100 p-1.5 text-ink-500"><Icon className="h-3.5 w-3.5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-900">{it.kind === 'note' ? <span className="whitespace-pre-wrap">{it.body}</span> : <><span className="font-medium">{it.subject}</span>{it.body && <span className="block whitespace-pre-wrap text-ink-700">{it.body}</span>}</>}</p>
                  <p className="text-xs text-ink-500">{it.kind === 'note' ? it.author?.name : it.actor?.name ?? 'System'} · {it.workspace?.code} · <span title={formatDateTime(it.at)}>{formatRelative(it.at)}</span>
                    {it.kind === 'note' && canEdit && <button className="ml-2 text-red-700 hover:underline" onClick={() => del(it.id)}><FiTrash2 className="inline" /></button>}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Searchable select of records from an endpoint (companies, contacts, leads…). */
export function RecordPicker({ label, endpoint, value, onChange, display, placeholder = 'Search…', hint }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get(endpoint, { params: { q: dq || undefined, pageSize: 20 } }).then((r) => setItems(r.data.data)).catch(() => setItems([]));
  }, [dq, open, endpoint]);
  useEffect(() => {
    if (value && (!current || current.id !== value)) api.get(`${endpoint}/${value}`).then((r) => setCurrent(r.data.data)).catch(() => setCurrent(null));
    if (!value) setCurrent(null);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input className="input" placeholder={placeholder} value={open ? q : current ? display(current) : ''} onFocus={() => { setOpen(true); setQ(''); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
        {value && !open && <button type="button" className="absolute right-2 top-2 text-xs text-ink-500 hover:text-red-700" onClick={() => onChange(null)}>Clear</button>}
        {open && (
          <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-lg">
            {items.length === 0 && <p className="px-3 py-2 text-sm text-ink-500">No matches</p>}
            {items.map((i) => <button type="button" key={i.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-50" onMouseDown={() => { onChange(i.id); setCurrent(i); setOpen(false); }}>{display(i)}</button>)}
          </div>
        )}
      </div>
    </Field>
  );
}
