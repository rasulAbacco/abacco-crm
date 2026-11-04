import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import LeadForm from './components/LeadForm';
import { leadService } from './services/leadService';
import { useApi } from '../../hooks/useApi';
import { PageHeader, Loading, ErrorState } from '../../components/common/ui';
import { toast } from '../../store/uiStore';

export default function EditLead() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => leadService.get(id), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="max-w-4xl">
      <PageHeader back={<Link to={`/leads/${id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"><FiArrowLeft /> {data.fullName}</Link>} title="Edit lead" />
      <div className="card p-5">
        <LeadForm initial={data} onCancel={() => navigate(`/leads/${id}`)} onSubmit={async (body) => {
          await leadService.update(id, body);
          toast('Lead saved');
          navigate(`/leads/${id}`);
        }} />
      </div>
    </div>
  );
}
