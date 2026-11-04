import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { companyService } from './services/companyService';
import CompanyForm from './components/CompanyForm';
import ContactForm from '../contacts/components/ContactForm';
import { useApi } from '../../hooks/useApi';
import RecordHeader from '../../components/common/RecordHeader';
import { RecordTimeline } from '../../components/common/RecordTools';
import { Loading, ErrorState, Card, DefinitionList, Tabs, StatusBadge, EmptyState } from '../../components/common/ui';
import TaskQuickAdd from '../tasks/components/TaskQuickAdd';
import { countryName } from '../../constants/options';
import { formatMoney, fullName } from '../../utils/format';

export default function CompanyDetails() {
  const { id } = useParams();
  const [tab, setTab] = useState('contacts');
  const [edit, setEdit] = useState(false);
  const [addContact, setAddContact] = useState(false);
  const { data: c, loading, error, reload } = useApi(() => companyService.get(id), [id]);
  if (loading && !c) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const canEdit = ['ACCOUNT', 'OWNER', 'COLLABORATE'].includes(c.access);
  return (
    <div>
      <RecordHeader entity="companies" record={c} title={c.name} subtitle={c.industry && <span className="text-ink-500">{c.industry}</span>} backTo="/companies" backLabel="Companies" onEdit={() => setEdit(true)} onChanged={reload} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Company details">
          <DefinitionList items={[
            ['Website', c.website ? <a className="link" href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.website}</a> : null], ['Industry', c.industry], ['Size', c.size],
            ['Email', c.email], ['Phone', c.phoneE164 ?? c.phoneRaw], ['Address', [c.addressLine1, c.addressLine2, c.city, c.region, c.postalCode].filter(Boolean).join(', ') || null],
            ['Country', c.countryCode ? countryName(c.countryCode) : null], ['Timezone', c.timezone], ['Tags', c.tags.length ? c.tags.map((t) => t.name).join(', ') : null],
          ]} />
          {c.description && <p className="mt-4 whitespace-pre-wrap border-t border-ink-100 pt-3 text-sm text-ink-700">{c.description}</p>}
        </Card>
        <div className="lg:col-span-2">
          <Card>
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'contacts', label: 'Contacts', count: c.contacts.length }, { value: 'leads', label: 'Leads', count: c.leads.length }, { value: 'deals', label: 'Deals', count: c.deals.length }, { value: 'activity', label: 'Notes & activity' }, { value: 'tasks', label: 'Follow-ups', count: c.tasks.length }]} />
            {tab === 'contacts' && <>{canEdit && <div className="mb-2 flex justify-end"><button className="btn-secondary btn-sm" onClick={() => setAddContact(true)}>Add contact</button></div>}{c.contacts.length ? <ul className="divide-y divide-ink-100">{c.contacts.map((p) => <li key={p.id} className="flex justify-between py-2 text-sm"><Link className="link" to={`/contacts/${p.id}`}>{fullName(p)}</Link><span className="text-ink-500">{p.designation ?? p.email}</span></li>)}</ul> : <EmptyState title="No contacts" />}</>}
            {tab === 'leads' && (c.leads.length ? <ul className="divide-y divide-ink-100">{c.leads.map((l) => <li key={l.id} className="flex justify-between py-2 text-sm"><Link className="link" to={`/leads/${l.id}`}>{l.fullName}</Link><StatusBadge value={l.status} /></li>)}</ul> : <EmptyState title="No leads" />)}
            {tab === 'deals' && (c.deals.length ? <ul className="divide-y divide-ink-100">{c.deals.map((d) => <li key={d.id} className="flex justify-between py-2 text-sm"><Link className="link" to={`/deals/${d.id}`}>{d.title}</Link><span>{formatMoney(d.amountMinor, d.currency)} · {d.stage?.name}</span></li>)}</ul> : <EmptyState title="No deals" />)}
            {tab === 'activity' && <RecordTimeline entity="companies" entityType="COMPANY" id={id} canEdit={canEdit} />}
            {tab === 'tasks' && <TaskQuickAdd link={{ companyId: id }} tasks={c.tasks} onChanged={reload} />}
          </Card>
        </div>
      </div>
      {edit && <CompanyForm open company={c} onClose={() => setEdit(false)} onSaved={reload} />}
      {addContact && <ContactForm open defaults={{ companyId: id }} onClose={() => setAddContact(false)} onSaved={reload} />}
    </div>
  );
}
