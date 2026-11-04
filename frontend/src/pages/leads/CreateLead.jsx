import { useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import LeadForm from './components/LeadForm';
import { leadService } from './services/leadService';
import { PageHeader } from '../../components/common/ui';
import { toast } from '../../store/uiStore';

export default function CreateLead() {
  const navigate = useNavigate();
  return (
    <div className="max-w-4xl">
      <PageHeader back={<Link to="/leads" className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"><FiArrowLeft /> Leads</Link>} title="New lead" />
      <div className="card p-5">
        <LeadForm isCreate submitLabel="Create lead" onCancel={() => navigate('/leads')} onSubmit={async (body) => {
          const r = await leadService.create(body);
          toast('Lead created');
          navigate(`/leads/${r.data.data.id}`);
        }} />
      </div>
    </div>
  );
}
