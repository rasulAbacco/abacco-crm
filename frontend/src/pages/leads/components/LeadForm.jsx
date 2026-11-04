import { useState } from 'react';
import { FormGrid } from '../../../components/forms/fields';
import OwnerSelect from '../../../components/forms/OwnerSelect';
import { RecordPicker } from '../../../components/common/RecordTools';
import { LEAD_STATUSES, PRIORITIES, LEAD_SOURCES } from '../../../constants/options';
import { errorMessage, fieldErrors } from '../../../services/axiosInstance';
import { toast } from '../../../store/uiStore';
import { Spinner, Alert } from '../../../components/common/ui';

export const toLeadForm = (l = {}) => ({
  firstName: l.firstName ?? '', lastName: l.lastName ?? '', email: l.email ?? '', phone: l.phoneRaw ?? '', companyName: l.companyName ?? '', companyId: l.companyId ?? null,
  designation: l.designation ?? '', website: l.website ?? '', countryCode: l.countryCode ?? '', region: l.region ?? '', city: l.city ?? '',
  timezone: l.timezoneSource === 'EXPLICIT' ? l.timezone : '', source: l.source ?? '', status: l.status ?? 'NEW', priority: l.priority ?? 'MEDIUM',
  description: l.description ?? '', tags: l.tags?.map((t) => t.name) ?? [],
});

const clean = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x]));

export default function LeadForm({ initial, onSubmit, submitLabel = 'Save', onCancel, isCreate }) {
  const [values, setValues] = useState(toLeadForm(initial));
  const [owner, setOwner] = useState('');
  const [errors, setErrors] = useState({});
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e, allowDuplicate = false) => {
    e?.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = { ...clean(values), status: values.status, priority: values.priority, tags: values.tags };
      if (isCreate && owner) body.ownerWorkspaceId = owner;
      if (allowDuplicate) body.allowDuplicate = true;
      await onSubmit(body);
    } catch (err) {
      if (err.response?.data?.error?.code === 'DUPLICATE_LEAD') setDup(err.response.data.error);
      else {
        setErrors(fieldErrors(err));
        toast(errorMessage(err), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {dup && <Alert>{dup.message} <button type="button" className="link ml-1" onClick={() => { setDup(null); submit(null, true); }}>Save anyway</button></Alert>}
      {isCreate && <div className="max-w-sm"><OwnerSelect value={owner} onChange={setOwner} /></div>}
      <section><h3 className="mb-3 text-sm font-semibold">Person</h3>
        <FormGrid values={values} errors={errors} onChange={setValues} fields={[
          { name: 'firstName', label: 'First name' }, { name: 'lastName', label: 'Last name' },
          { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', hint: 'Any format; include the country code for international numbers (e.g. +44…)' },
          { name: 'designation', label: 'Designation' }, { name: 'companyName', label: 'Company name' },
          { name: 'companyId', render: (v, set) => <RecordPicker label="Link to company record" endpoint="/companies" value={v.companyId} onChange={(id) => set({ ...v, companyId: id })} display={(c) => c.name} /> },
          { name: 'website', label: 'Website' },
        ]} />
      </section>
      <section><h3 className="mb-3 text-sm font-semibold">Location</h3>
        <FormGrid values={values} errors={errors} onChange={setValues} fields={[
          { name: 'countryCode', label: 'Country', type: 'country' }, { name: 'timezone', label: 'Timezone', type: 'timezone', hint: 'Leave on Automatic to use the phone number or country' },
          { name: 'region', label: 'State / region' }, { name: 'city', label: 'City' },
        ]} />
      </section>
      <section><h3 className="mb-3 text-sm font-semibold">Qualification</h3>
        <FormGrid values={values} errors={errors} onChange={setValues} fields={[
          { name: 'status', label: 'Status', type: 'select', options: LEAD_STATUSES }, { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
          { name: 'source', label: 'Lead source', type: 'select', options: LEAD_SOURCES.map((s) => [s, s]) }, { name: 'tags', label: 'Tags', type: 'tags' },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 },
        ]} />
      </section>
      <div className="flex justify-end gap-2 border-t border-ink-200 pt-4">
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{submitLabel}</button>
      </div>
    </form>
  );
}
