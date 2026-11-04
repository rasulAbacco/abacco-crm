import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import { templateService } from './services/templateService';
import EmailEditor from '../../components/forms/EmailEditor';
import { PageHeader, Card, Loading, Spinner } from '../../components/common/ui';
import { TextInput, Checkbox } from '../../components/forms/fields';
import OwnerSelect from '../../components/forms/OwnerSelect';
import { toast } from '../../store/uiStore';
import { errorMessage } from '../../services/axiosInstance';

const STARTER = '<h1>Hello {{firstName|there}},</h1><p>Write your message here.</p><p>Best regards,<br>{{senderName}}</p>';

export default function TemplateEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [t, setT] = useState(isNew ? { name: '', subject: '', preheader: '', html: STARTER, shared: false } : null);
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!isNew) templateService.get(id).then((r) => setT(r.data.data)).catch((e) => toast(errorMessage(e), 'error')); }, [id, isNew]);
  if (!t) return <Loading />;
  const save = async () => {
    setBusy(true);
    try {
      const body = { name: t.name, subject: t.subject || null, preheader: t.preheader || null, html: t.html };
      if (isNew) {
        const r = await templateService.create({ ...body, shared: t.shared, ...(owner && !t.shared ? { ownerWorkspaceId: owner } : {}) });
        toast('Template saved');
        navigate(`/templates/${r.data.data.id}`, { replace: true });
      } else {
        const r = await templateService.update(id, body);
        setT(r.data.data);
        toast('Template saved');
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-5xl">
      <PageHeader back={<Link to="/templates" className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"><FiArrowLeft /> Templates</Link>} title={isNew ? 'New template' : t.name} actions={<button className="btn-primary" disabled={busy || !t.name || !t.html} onClick={save}>{busy && <Spinner className="h-4 w-4" />}Save template</button>} />
      <Card>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput label="Template name" required value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
          <TextInput label="Default subject" value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} />
          <TextInput label="Preheader (inbox preview text)" value={t.preheader} onChange={(e) => setT({ ...t, preheader: e.target.value })} />
          {isNew && <div className="space-y-2"><Checkbox label="Available to all Sales IDs" checked={t.shared} onChange={(e) => setT({ ...t, shared: e.target.checked })} />{!t.shared && <OwnerSelect value={owner} onChange={setOwner} />}</div>}
        </div>
        <EmailEditor value={t.html} onChange={(html) => setT((x) => ({ ...x, html }))} height={460} />
      </Card>
    </div>
  );
}
