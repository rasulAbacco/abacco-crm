import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBriefcase } from 'react-icons/fi';
import RecordListPage from '../../components/common/RecordListPage';
import { OwnerBadge } from '../../components/common/RecordTools';
import CompanyForm from './components/CompanyForm';
import { COUNTRIES } from '../../constants/options';
import { formatDate } from '../../utils/format';

export default function CompanyList() {
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <RecordListPage entity="companies" title="Companies" subtitle="Organisations linked to your contacts, leads and deals" createLabel="New company" onCreate={() => setCreating(true)} emptyIcon={FiBriefcase} defaultSort="name"
        filters={[{ name: 'countryCode', label: 'Country', options: COUNTRIES }]}
        columns={[
          { key: 'name', header: 'Company', sort: 'name', render: (r) => <div><p className="font-medium text-ink-900">{r.name}</p><p className="text-xs text-ink-500">{r.domain ?? ''}</p></div> },
          { key: 'industry', header: 'Industry', sort: 'industry', render: (r) => r.industry ?? '—' },
          { key: 'country', header: 'Country', render: (r) => r.countryCode ?? '—' },
          { key: 'contacts', header: 'Contacts', className: 'text-right', render: (r) => r._count?.contacts ?? 0 },
          { key: 'deals', header: 'Deals', className: 'text-right', render: (r) => r._count?.deals ?? 0 },
          { key: 'owner', header: 'Sales ID', render: (r) => <OwnerBadge record={r} /> },
          { key: 'createdAt', header: 'Created', sort: 'createdAt', render: (r) => formatDate(r.createdAt) },
        ]} />
      {creating && <CompanyForm open onClose={() => setCreating(false)} onSaved={(c) => navigate(`/companies/${c.id}`)} />}
    </>
  );
}
