import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { contactService } from './services/contactService';
import ContactForm from './components/ContactForm';
import { useApi } from '../../hooks/useApi';
import RecordHeader from '../../components/common/RecordHeader';
import { RecordTimeline } from '../../components/common/RecordTools';
import { Loading, ErrorState, Card, DefinitionList, Tabs, StatusBadge, EmptyState, ConfirmDialog, Badge } from '../../components/common/ui';
import TaskQuickAdd from '../tasks/components/TaskQuickAdd';
import { countryName } from '../../constants/options';
import { formatDateTime, formatMoney, fullName } from '../../utils/format';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

export default function ContactDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('activity');
  const [edit, setEdit] = useState(false);
  const [erase, setErase] = useState(false);
  const { data: c, loading, error, reload } = useApi(() => contactService.get(id), [id]);
  if (loading && !c) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const canEdit = ['ACCOUNT', 'OWNER', 'COLLABORATE'].includes(c.access);
  const latestConsent = c.consents[0];
  const consentAction = async (status) => {
    try {
      await contactService.consent(id, { status, legalBasis: 'consent', source: 'manual' });
      toast(status === 'GRANTED' ? 'Consent recorded' : 'Consent withdrawn');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <div>
      <RecordHeader entity="contacts" record={c} title={fullName(c)} subtitle={c.designation && <span className="text-ink-500">{c.designation}</span>} backTo="/contacts" backLabel="Contacts" onEdit={() => setEdit(true)} onChanged={reload} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Details">
            <DefinitionList items={[
              ['Email', c.email ? <a className="link" href={`mailto:${c.email}`}>{c.email}</a> : null], ['Phone', c.phoneE164 ?? c.phoneRaw],
              ['Company', c.company ? <Link className="link" to={`/companies/${c.company.id}`}>{c.company.name}</Link> : null], ['Country', c.countryCode ? countryName(c.countryCode) : null],
              ['City', [c.city, c.region].filter(Boolean).join(', ') || null], ['Timezone', c.timezone ? `${c.timezone} (${c.timezoneSource.toLowerCase()})` : 'Account default'],
              ['Source', c.source], ['Tags', c.tags.length ? c.tags.map((t) => t.name).join(', ') : null], ['Created', formatDateTime(c.createdAt)], ['Last contacted', formatDateTime(c.lastContactedAt)],
            ]} />
          </Card>
          <Card title="Email consent">
            <p className="text-sm">{latestConsent ? <><StatusBadge value={latestConsent.status === 'GRANTED' ? 'ACTIVE' : 'UNSUBSCRIBED'} /> <span className="ml-1 text-ink-700">{latestConsent.status === 'GRANTED' ? `Granted (${latestConsent.legalBasis ?? '—'})` : 'Withdrawn'} · {formatDateTime(latestConsent.capturedAt)}</span></> : <span className="text-ink-500">No consent recorded</span>}</p>
            {canEdit && c.email && <div className="mt-3 flex gap-2"><button className="btn-secondary btn-sm" onClick={() => consentAction('GRANTED')}>Record consent</button>{latestConsent?.status === 'GRANTED' && <button className="btn-secondary btn-sm" onClick={() => consentAction('WITHDRAWN')}>Withdraw</button>}</div>}
            {['ACCOUNT', 'OWNER'].includes(c.access) && <button className="mt-4 text-xs text-red-700 hover:underline" onClick={() => setErase(true)}>Erase personal data (GDPR / DPDP request)</button>}
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'activity', label: 'Notes & activity' }, { value: 'tasks', label: 'Follow-ups', count: c.tasks.length }, { value: 'deals', label: 'Deals', count: c.deals.length }, { value: 'email', label: 'Email history', count: c.campaignRecips.length }, { value: 'lists', label: 'Lists', count: c.listMemberships.length }]} />
            {tab === 'activity' && <RecordTimeline entity="contacts" entityType="CONTACT" id={id} canEdit={canEdit} />}
            {tab === 'tasks' && <TaskQuickAdd link={{ contactId: id }} tasks={c.tasks} onChanged={reload} />}
            {tab === 'deals' && (c.deals.length ? <ul className="divide-y divide-ink-100">{c.deals.map((d) => <li key={d.id} className="flex justify-between py-2 text-sm"><Link className="link" to={`/deals/${d.id}`}>{d.title}</Link><span>{formatMoney(d.amountMinor, d.currency)} · {d.stage?.name}</span></li>)}</ul> : <EmptyState title="No deals" />)}
            {tab === 'email' && (c.campaignRecips.length ? <ul className="divide-y divide-ink-100">{c.campaignRecips.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><Link className="link" to={`/campaigns/${r.campaign.id}`}>{r.campaign.name}</Link><span className="flex items-center gap-2 text-xs text-ink-500"><StatusBadge value={r.status} />{r.sentAt && formatDateTime(r.sentAt)}{r.firstOpenedAt && <Badge tone="blue">opened*</Badge>}{r.firstClickedAt && <Badge tone="green">clicked</Badge>}</span></li>)}</ul> : <EmptyState title="No emails sent yet" />)}
            {tab === 'lists' && (c.listMemberships.length ? <ul className="divide-y divide-ink-100">{c.listMemberships.map((m) => <li key={m.list.id} className="flex justify-between py-2 text-sm"><Link className="link" to={`/email-lists/${m.list.id}`}>{m.list.name}</Link><StatusBadge value={m.status} /></li>)}</ul> : <EmptyState title="Not on any list" />)}
            {tab === 'email' && c.campaignRecips.length > 0 && <p className="mt-3 text-xs text-ink-400">* Opens are estimates (image blocking and privacy proxies affect them).</p>}
          </Card>
        </div>
      </div>
      {edit && <ContactForm open contact={c} onClose={() => setEdit(false)} onSaved={reload} />}
      <ConfirmDialog open={erase} title="Erase this person's data?" message="Name, email, phone, notes and list memberships are removed permanently. A one-way hash of the email stays on the suppression list so they are never emailed again. This cannot be undone." confirmLabel="Erase permanently" onClose={() => setErase(false)}
        onConfirm={async () => { try { await contactService.erase(id); toast('Personal data erased'); navigate('/contacts'); } catch (err) { toast(errorMessage(err), 'error'); } }} />
    </div>
  );
}
