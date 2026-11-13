import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiPlus, FiSend, FiTrash2 } from "react-icons/fi";
import { campaignService } from "./services/campaignService";
import { useApi } from "../../hooks/useApi";
import DataTable from "../../components/common/DataTable";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  Badge,
  ProgressBar,
  Tabs,
  ConfirmDialog,
} from "../../components/common/ui";
import { toast } from "../../store/uiStore";
import { errorMessage } from "../../services/axiosInstance";
import { formatDateTime } from "../../utils/format";

const TABS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Drafts" },
  { value: "SCHEDULED,QUEUED,SENDING,PAUSED", label: "Active" },
  {
    value: "COMPLETED,COMPLETED_WITH_ERRORS,FAILED,CANCELLED",
    label: "Finished",
  },
];

export function progressOf(p = {}) {
  const total = Object.values(p).reduce((a, b) => a + b, 0);
  const done = [
    "SENT",
    "FAILED",
    "BOUNCED",
    "SUPPRESSED",
    "SKIPPED",
    "CANCELLED",
    "UNSUBSCRIBED",
  ].reduce((a, k) => a + (p[k] ?? 0), 0);
  return { total, done, sent: p.SENT ?? 0 };
}

export default function CampaignList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useApi(
    () => campaignService.list({ page, status: status || undefined }),
    [page, status],
  );
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await campaignService.remove(toDelete.id);
      toast(`Draft "${toDelete.name}" deleted`);
      setToDelete(null);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Email campaigns sent through your SMTP accounts"
        actions={
          <button
            className="btn-primary"
            onClick={() => navigate("/campaigns/new")}
          >
            <FiPlus /> New campaign
          </button>
        }
      />
      <Tabs
        tabs={TABS}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />
      <DataTable
        rows={data}
        meta={meta}
        loading={loading}
        error={error}
        onRetry={reload}
        onPage={setPage}
        onRowClick={(r) =>
          navigate(
            r.status === "DRAFT"
              ? `/campaigns/${r.id}/edit`
              : `/campaigns/${r.id}`,
          )
        }
        empty={
          <EmptyState
            icon={FiSend}
            title="No campaigns"
            action={
              <button
                className="btn-primary"
                onClick={() => navigate("/campaigns/new")}
              >
                <FiPlus /> New campaign
              </button>
            }
          />
        }
        columns={[
          {
            key: "name",
            header: "Campaign",
            render: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-ink-500">
                  {r.subject ?? "No subject yet"}
                </p>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => (
              <div>
                <StatusBadge value={r.status} />
                {r.statusReason && (
                  <p
                    className="mt-0.5 max-w-[14rem] truncate text-[11px] text-amber-700"
                    title={r.statusReason}
                  >
                    {r.statusReason}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: "progress",
            header: "Progress",
            render: (r) => {
              const p = progressOf(r.progress);
              return p.total ? (
                <div className="w-36">
                  <ProgressBar value={p.done} total={p.total} />
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {p.sent} sent · {p.done}/{p.total}
                  </p>
                </div>
              ) : (
                "—"
              );
            },
          },
          {
            key: "ws",
            header: "Sales ID",
            render: (r) => <Badge>{r.ownerWorkspace.code}</Badge>,
          },
          {
            key: "when",
            header: "Scheduled / started",
            render: (r) => formatDateTime(r.startedAt ?? r.scheduledAtUtc),
          },
          {
            key: "created",
            header: "Created",
            render: (r) => formatDateTime(r.createdAt),
          },
          {
            key: "actions",
            header: "",
            render: (r) =>
              r.status === "DRAFT" && (
                <button
                  type="button"
                  className="btn-ghost btn-sm text-red-700"
                  title="Delete draft"
                  aria-label={`Delete draft ${r.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete(r);
                  }}
                >
                  <FiTrash2 />
                </button>
              ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this draft?"
        message={
          toDelete
            ? `"${toDelete.name}" is removed from your campaigns. Nothing has been sent from it.`
            : ""
        }
        confirmLabel="Delete draft"
        busy={busy}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}
