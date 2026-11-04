import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiUpload, FiDownload, FiUserPlus, FiFilter, FiTrash2 } from 'react-icons/fi';
import { listService } from './services/listService';
import { useApi, useDebounce } from '../../hooks/useApi';
import DataTable from '../../components/common/DataTable';
import { PageHeader, Loading, ErrorState, StatusBadge, StatCard, Modal, ConfirmDialog, Alert } from '../../components/common/ui';
import { TextArea, CountrySelect, Field, TagInput, Select } from '../../components/forms/fields';
import { ImportModal } from '../../components/common/RecordTools';
import { COUNTRIES } from '../../constants/options';
import { formatDate, fullName, num } from '../../utils/format';
import { download, errorMessage } from '../../services/axiosInstance';
import { toast } from '../../store/uiStore';

export default function EmailListDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null);
  const [emails, setEmails] = useState('');
  const [seg, setSeg] = useState({ countryCodes: [], tags: [] });
  const [segCountry, setSegCountry] = useState('');
  const dq = useDebounce(q);
  const list = useApi(() => listService.get(id), [id]);
  const m = useApi(() => listService.members(id, { page, status: status || undefined, q: dq || undefined }), [id, page, status, dq]);
  const refresh = () => { list.reload(); m.reload(); };
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  const l = list.data;
  const addEmails = async () => {
    const rows = emails.split('\n').map((line) => line.split(',').map((x) => x.trim())).filter((r) => r[0]).map(([email, firstName, lastName, countryCode]) => ({ email, firstName: firstName || undefined, lastName: lastName || undefined, countryCode: countryCode?.toUpperCase() || undefined }));
    try {
      const r = await listService.addMembers(id, { emails: rows });
      toast(`${r.data.data.added} added (${r.data.data.createdContacts} new contacts)`);
      setModal(null);
      setEmails('');
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const addSegment = async () => {
    try {
      const r = await listService.addSegment(id, { countryCodes: seg.countryCodes.length ? seg.countryCodes : undefined, tags: seg.tags.length ? seg.tags : undefined });
      toast(`${r.data.data.added} contacts added`);
      setModal(null);
      refresh();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <div>
      <PageHeader back={<Link to="/email-lists" className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"><FiArrowLeft /> Email lists</Link>} title={l.name} subtitle={`${l.ownerWorkspace.code} · ${l.description ?? ''}`} actions={<>
        <button className="btn-secondary" onClick={() => setModal('emails')}><FiUserPlus /> Add people</button>
        <button className="btn-secondary" onClick={() => setModal('segment')}><FiFilter /> Add a segment</button>
        <button className="btn-secondary" onClick={() => setModal('import')}><FiUpload /> Import</button>
        <button className="btn-secondary" onClick={() => download(`/email-lists/${id}/export`, { format: 'xlsx' }, 'list.xlsx').catch((e) => toast(errorMessage(e), 'error'))}><FiDownload /> Export</button>
        <button className="btn-secondary text-red-700" onClick={() => setModal('delete')} aria-label="Delete list"><FiTrash2 /></button>
      </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Subscribed" tone="green" value={num(l.counts.SUBSCRIBED)} /><StatCard label="Unsubscribed" tone="amber" value={num(l.counts.UNSUBSCRIBED)} /><StatCard label="Bounced" tone="red" value={num(l.counts.BOUNCED)} /><StatCard label="Removed" tone="gray" value={num(l.counts.REMOVED)} />
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input className="input flex-1" placeholder="Search members…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All statuses</option>{['SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'REMOVED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select>
        {selected.length > 0 && <button className="btn-secondary" onClick={() => listService.removeMembers(id, { contactIds: selected }).then(() => { toast('Removed from list'); setSelected([]); refresh(); })}>Remove {selected.length}</button>}
      </div>
      <DataTable rows={m.data} meta={m.meta} loading={m.loading} error={m.error} onRetry={m.reload} onPage={setPage} rowKey={(r) => r.contact.id} selectable selected={selected} onSelect={setSelected} onRowClick={(r) => navigate(`/contacts/${r.contact.id}`)}
        columns={[
          { key: 'email', header: 'Email', render: (r) => r.contact.email }, { key: 'name', header: 'Name', render: (r) => fullName(r.contact) },
          { key: 'country', header: 'Country', render: (r) => r.contact.countryCode ?? '—' }, { key: 'tz', header: 'Timezone', render: (r) => r.contact.timezone ?? 'Default' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} /> }, { key: 'added', header: 'Added', render: (r) => formatDate(r.addedAt) },
        ]} />
      <Modal open={modal === 'emails'} onClose={() => setModal(null)} title="Add people" footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={!emails.trim()} onClick={addEmails}>Add</button></>}>
        <TextArea label="One per line: email, first name, last name, country code" rows={8} placeholder={'priya@example.com, Priya, Sharma, IN\njohn@example.com, John, Smith, US'} value={emails} onChange={(e) => setEmails(e.target.value)} />
        <p className="mt-2 text-xs text-ink-500">New addresses become contacts in {l.ownerWorkspace.code}. People who unsubscribed stay unsubscribed.</p>
      </Modal>
      <Modal open={modal === 'segment'} onClose={() => setModal(null)} title="Add contacts by segment" footer={<><button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={!seg.countryCodes.length && !seg.tags.length} onClick={addSegment}>Add matching contacts</button></>}>
        <div className="space-y-3">
          <Field label="Countries"><div className="flex gap-2"><div className="flex-1"><Select value={segCountry} onChange={(e) => setSegCountry(e.target.value)} options={COUNTRIES} placeholder="Choose a country" /></div><button type="button" className="btn-secondary" onClick={() => segCountry && !seg.countryCodes.includes(segCountry) && setSeg({ ...seg, countryCodes: [...seg.countryCodes, segCountry] })}>Add</button></div>
            <div className="mt-2 flex flex-wrap gap-1">{seg.countryCodes.map((c) => <button key={c} className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800" onClick={() => setSeg({ ...seg, countryCodes: seg.countryCodes.filter((x) => x !== c) })}>{c} ×</button>)}</div></Field>
          <TagInput label="Contacts with all of these tags" value={seg.tags} onChange={(tags) => setSeg({ ...seg, tags })} />
          <Alert tone="blue">Contacts visible to the selected Sales ID (owned or shared) with an email address are added.</Alert>
        </div>
      </Modal>
      <ImportModal noOwner open={modal === 'import'} onClose={() => setModal(null)} url={`/email-lists/${id}/import`} title={`Import into ${l.name}`} columnsHint="Columns: Email (required), First Name, Last Name, Company, Country (2-letter), Phone, Timezone" onDone={refresh} />
      <ConfirmDialog open={modal === 'delete'} title="Delete this list?" message="Contacts stay in the CRM; only the list is removed." confirmLabel="Delete" onClose={() => setModal(null)} onConfirm={() => listService.remove(id).then(() => { toast('List deleted'); navigate('/email-lists'); }).catch((e) => toast(errorMessage(e), 'error'))} />
    </div>
  );
}
