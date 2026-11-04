import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { dealService } from './services/dealService';
import DealForm from './components/DealForm';
import { useApi } from '../../hooks/useApi';
import RecordHeader from '../../components/common/RecordHeader';
import { RecordTimeline } from '../../components/common/RecordTools';
import { Loading, ErrorState, Card, DefinitionList, Tabs, StatusBadge } from '../../components/common/ui';
import TaskQuickAdd from '../tasks/components/TaskQuickAdd';
import { formatMoney, formatDate, formatDateTime, fullName } from '../../utils/format';

export default function DealDetails() {
  const { id } = useParams();
  const [tab, setTab] = useState('activity');
  const [edit, setEdit] = useState(false);
  const { data: d, loading, error, reload } = useApi(() => dealService.get(id), [id]);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const canEdit = ['ACCOUNT', 'OWNER', 'COLLABORATE'].includes(d.access);
  return (
    <div>
      <RecordHeader entity="deals" record={d} title={d.title} subtitle={<><StatusBadge value={d.status} /><span className="font-semibold text-ink-900">{formatMoney(d.amountMinor, d.currency)}</span></>} backTo="/deals" backLabel="Deals" onEdit={() => setEdit(true)} onChanged={reload} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Deal details">
          <DefinitionList items={[
            ['Pipeline', d.pipeline?.name], ['Stage', d.stage?.name], ['Probability', `${d.probability ?? d.stage?.probability ?? 0}%`], ['Amount', formatMoney(d.amountMinor, d.currency)],
            ['Expected close', d.expectedCloseDate ? formatDate(d.expectedCloseDate) : null], ['Closed', d.closedAt ? formatDateTime(d.closedAt) : null],
            ['Contact', d.contact ? <Link className="link" to={`/contacts/${d.contact.id}`}>{fullName(d.contact)}</Link> : null], ['Company', d.company ? <Link className="link" to={`/companies/${d.company.id}`}>{d.company.name}</Link> : null],
            ['Lead', d.lead ? <Link className="link" to={`/leads/${d.lead.id}`}>{d.lead.fullName}</Link> : null], d.lostReason && ['Lost reason', d.lostReason],
          ]} />
          {d.description && <p className="mt-4 whitespace-pre-wrap border-t border-ink-100 pt-3 text-sm text-ink-700">{d.description}</p>}
        </Card>
        <div className="lg:col-span-2"><Card>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'activity', label: 'Notes & activity' }, { value: 'tasks', label: 'Follow-ups', count: d.tasks.length }]} />
          {tab === 'activity' ? <RecordTimeline entity="deals" entityType="DEAL" id={id} canEdit={canEdit} /> : <TaskQuickAdd link={{ dealId: id }} tasks={d.tasks} onChanged={reload} />}
        </Card></div>
      </div>
      {edit && <DealForm open deal={d} onClose={() => setEdit(false)} onSaved={reload} />}
    </div>
  );
}
