import { useState } from 'react';
import { Modal, Spinner } from '../../../components/common/ui';
import { FormGrid } from '../../../components/forms/fields';
import OwnerSelect from '../../../components/forms/OwnerSelect';
import { companyService } from '../services/companyService';
import { errorMessage, fieldErrors } from '../../../services/axiosInstance';
import { toast } from '../../../store/uiStore';

const SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

export default function CompanyForm({ open, onClose, company, onSaved }) {
  const keys = ['name', 'website', 'industry', 'size', 'email', 'addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'countryCode', 'timezone', 'description'];
  const [v, setV] = useState({ ...Object.fromEntries(keys.map((k) => [k, company?.[k] ?? ''])), phone: company?.phoneRaw ?? '', tags: company?.tags?.map((t) => t.name) ?? [] });
  const [owner, setOwner] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x]));
      body.tags = v.tags;
      const r = company ? await companyService.update(company.id, body) : await companyService.create({ ...body, ...(owner ? { ownerWorkspaceId: owner } : {}) });
      toast(company ? 'Company saved' : 'Company created');
      onSaved?.(r.data.data);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={company ? 'Edit company' : 'New company'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !v.name} onClick={save}>{busy && <Spinner className="h-4 w-4" />}Save</button></>}>
      {!company && <div className="mb-4 max-w-sm"><OwnerSelect value={owner} onChange={setOwner} /></div>}
      <FormGrid values={v} errors={errors} onChange={setV} fields={[
        { name: 'name', label: 'Company name', required: true, span: 2 }, { name: 'website', label: 'Website' }, { name: 'industry', label: 'Industry' },
        { name: 'size', label: 'Company size', type: 'select', options: SIZES.map((s) => [s, `${s} employees`]) }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' },
        { name: 'countryCode', label: 'Country', type: 'country' }, { name: 'addressLine1', label: 'Address', span: 2 }, { name: 'addressLine2', label: 'Address line 2', span: 2 },
        { name: 'city', label: 'City' }, { name: 'region', label: 'State / region' }, { name: 'postalCode', label: 'Postal code' }, { name: 'timezone', label: 'Timezone', type: 'timezone' },
        { name: 'tags', label: 'Tags', type: 'tags' }, { name: 'description', label: 'Description', type: 'textarea', span: 2 },
      ]} />
    </Modal>
  );
}
