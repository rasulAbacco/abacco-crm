import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUsers } from 'react-icons/fi';
import RecordListPage from '../../components/common/RecordListPage';
import { OwnerBadge } from '../../components/common/RecordTools';
import ContactForm from './components/ContactForm';
import { COUNTRIES } from '../../constants/options';
import { formatDate, fullName } from '../../utils/format';

export default function ContactList() {
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <RecordListPage entity="contacts" title="Contacts" subtitle="People you do business with" createLabel="New contact" onCreate={() => setCreating(true)} emptyIcon={FiUsers}
        importHint="Columns: First Name, Last Name, Email, Phone, Company, Designation, Country (2-letter), City, Timezone, Source"
        filters={[{ name: 'countryCode', label: 'Country', options: COUNTRIES }, { name: 'hasEmail', label: 'Email', options: [['true', 'Has email'], ['false', 'No email']] }]}
        columns={[
          { key: 'name', header: 'Name', sort: 'firstName', render: (r) => <div><p className="font-medium text-ink-900">{fullName(r)}</p><p className="text-xs text-ink-500">{r.designation ?? ''}</p></div> },
          { key: 'email', header: 'Email', sort: 'email', render: (r) => r.email ?? '—' },
          { key: 'phone', header: 'Phone', render: (r) => r.phoneE164 ?? r.phoneRaw ?? '—' },
          { key: 'company', header: 'Company', render: (r) => r.company?.name ?? '—' },
          { key: 'country', header: 'Country', render: (r) => r.countryCode ?? '—' },
          { key: 'tz', header: 'Timezone', render: (r) => <span className="text-xs">{r.timezone ?? 'Default'}</span> },
          { key: 'owner', header: 'Sales ID', render: (r) => <OwnerBadge record={r} /> },
          { key: 'createdAt', header: 'Created', sort: 'createdAt', render: (r) => formatDate(r.createdAt) },
        ]} />
      {creating && <ContactForm open onClose={() => setCreating(false)} onSaved={(c) => navigate(`/contacts/${c.id}`)} />}
    </>
  );
}
