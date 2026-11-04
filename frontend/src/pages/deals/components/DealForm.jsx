import { useEffect, useState } from 'react';
import { Modal, Spinner } from '../../../components/common/ui';
import { FormGrid } from '../../../components/forms/fields';
import OwnerSelect from '../../../components/forms/OwnerSelect';
import { RecordPicker } from '../../../components/common/RecordTools';
import { dealService } from '../services/dealService';
import { errorMessage, fieldErrors } from '../../../services/axiosInstance';
import { toast } from '../../../store/uiStore';
import { minorToInput, fullName } from '../../../utils/format';
import { useAuthStore } from '../../../store/authStore';

export default function DealForm({ open, onClose, deal, stageId, pipelineId, onSaved }) {
  const defCur = useAuthStore((s) => s.user?.account?.defaultCurrency ?? 'INR');
  const [v, setV] = useState({
    title: deal?.title ?? '', amount: deal ? minorToInput(deal.amountMinor, deal.currency) : '', currency: deal?.currency ?? defCur, stageId: deal?.stageId ?? stageId ?? '',
    probability: deal?.probability ?? '', expectedCloseDate: deal?.expectedCloseDate?.slice(0, 10) ?? '', contactId: deal?.contactId ?? null, companyId: deal?.companyId ?? null,
    leadId: deal?.leadId ?? null, description: deal?.description ?? '', lostReason: deal?.lostReason ?? '', tags: deal?.tags?.map((t) => t.name) ?? [],
  });
  const [owner, setOwner] = useState('');
  const [stages, setStages] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dealService.pipelines().then((r) => {
      const p = r.data.data.find((x) => x.id === (deal?.pipelineId ?? pipelineId)) ?? r.data.data.find((x) => !owner || x.workspace.id === owner) ?? r.data.data[0];
      setStages(p?.stages ?? []);
    }).catch(() => {});
  }, [deal, pipelineId, owner]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...v, amount: v.amount || '0', probability: v.probability === '' ? null : Number(v.probability), expectedCloseDate: v.expectedCloseDate || null, description: v.description || null, lostReason: v.lostReason || null, stageId: v.stageId || undefined };
      if (!deal && !stageId && owner) delete body.stageId;
      const r = deal ? await dealService.update(deal.id, body) : await dealService.create({ ...body, ...(owner ? { ownerWorkspaceId: owner } : {}) });
      toast(deal ? 'Deal saved' : 'Deal created');
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
    <Modal open={open} onClose={onClose} size="lg" title={deal ? 'Edit deal' : 'New deal'} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !v.title} onClick={save}>{busy && <Spinner className="h-4 w-4" />}Save</button></>}>
      {!deal && <div className="mb-4 max-w-sm"><OwnerSelect value={owner} onChange={setOwner} /></div>}
      <FormGrid values={v} errors={errors} onChange={setV} fields={[
        { name: 'title', label: 'Deal title', required: true, span: 2 },
        { name: 'amount', label: 'Amount', inputMode: 'decimal', placeholder: '0.00', hint: 'Entered manually; never converted between currencies' }, { name: 'currency', label: 'Currency', type: 'currency' },
        { name: 'stageId', label: 'Stage', type: 'select', options: stages.map((s) => [s.id, `${s.name} (${s.probability}%)`]), placeholder: 'First open stage' },
        { name: 'probability', label: 'Probability % (optional)', type: 'number', hint: 'Overrides the stage probability' },
        { name: 'expectedCloseDate', label: 'Expected close date', type: 'date' },
        { name: 'contactId', render: (x, set) => <RecordPicker label="Contact" endpoint="/contacts" value={x.contactId} onChange={(id) => set({ ...x, contactId: id })} display={fullName} /> },
        { name: 'companyId', render: (x, set) => <RecordPicker label="Company" endpoint="/companies" value={x.companyId} onChange={(id) => set({ ...x, companyId: id })} display={(c) => c.name} /> },
        { name: 'leadId', render: (x, set) => <RecordPicker label="Lead" endpoint="/leads" value={x.leadId} onChange={(id) => set({ ...x, leadId: id })} display={(l) => l.fullName} /> },
        { name: 'tags', label: 'Tags', type: 'tags' }, { name: 'description', label: 'Notes', type: 'textarea', span: 2 },
        deal?.status === 'LOST' && { name: 'lostReason', label: 'Lost reason', span: 2 },
      ]} />
    </Modal>
  );
}
