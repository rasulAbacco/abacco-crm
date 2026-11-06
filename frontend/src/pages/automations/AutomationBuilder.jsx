import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { FiArrowLeft, FiPlay, FiPause, FiTrash2, FiSave } from "react-icons/fi";
import { automationService } from "./services/automationService";
import StepEditor, { STEP_TYPES } from "./components/StepEditor";
import api, { errorMessage } from "../../services/axiosInstance";
import { useSalesIdStore } from "../../store/salesIdStore";
import { toast } from "../../store/uiStore";
import DataTable from "../../components/common/DataTable";
import {
  PageHeader,
  Card,
  Loading,
  Alert,
  StatusBadge,
  Tabs,
  ConfirmDialog,
  Badge,
} from "../../components/common/ui";
import { TextInput, Select, Checkbox } from "../../components/forms/fields";
import { RecordPicker } from "../../components/common/RecordTools";
import { LEAD_STATUSES } from "../../constants/options";
import { formatDateTime, humanize, fullName } from "../../utils/format";
import { useApi } from "../../hooks/useApi";

const TRIGGERS = [
  ["LEAD_CREATED", "A lead is created"],
  ["LEAD_STATUS_CHANGED", "A lead changes status"],
  ["CONTACT_CREATED", "A contact is created"],
  ["LIST_JOINED", "Someone joins a list"],
  ["MANUAL", "Manually enrolled"],
];

function Logs({ id }) {
  const [tab, setTab] = useState("enrollments");
  const [page, setPage] = useState(1);
  const e = useApi(
    () =>
      tab === "enrollments"
        ? automationService.enrollments(id, { page })
        : automationService.executions(id, { page }),
    [id, tab, page],
  );
  return (
    <Card title="Execution log">
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
        tabs={[
          { value: "enrollments", label: "People" },
          { value: "executions", label: "Step runs" },
        ]}
      />
      {tab === "enrollments" ? (
        <DataTable
          rows={e.data}
          meta={e.meta}
          loading={e.loading}
          error={e.error}
          onRetry={e.reload}
          onPage={setPage}
          columns={[
            {
              key: "who",
              header: "Person",
              render: (r) => (
                <div>
                  <p>
                    {r.contact
                      ? fullName(r.contact)
                      : (r.lead?.fullName ?? "—")}
                  </p>
                  <p className="text-xs text-ink-500">{r.emailNormalized}</p>
                </div>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <div>
                  <StatusBadge value={r.status} />
                  {r.exitReason && (
                    <p className="text-[11px] text-ink-500">
                      {humanize(r.exitReason)}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: "step",
              header: "Next step",
              render: (r) => r.currentPosition + 1,
            },
            {
              key: "next",
              header: "Next run",
              render: (r) => formatDateTime(r.nextRunAt),
            },
            {
              key: "at",
              header: "Enrolled",
              render: (r) => formatDateTime(r.enrolledAt),
            },
          ]}
        />
      ) : (
        <DataTable
          rows={e.data}
          meta={e.meta}
          loading={e.loading}
          error={e.error}
          onRetry={e.reload}
          onPage={setPage}
          columns={[
            {
              key: "email",
              header: "Person",
              render: (r) => r.enrollment.emailNormalized,
            },
            {
              key: "step",
              header: "Step",
              render: (r) => `${r.step.position + 1}. ${humanize(r.step.type)}`,
            },
            {
              key: "status",
              header: "Result",
              render: (r) => (
                <div>
                  <StatusBadge
                    value={r.status === "SUCCEEDED" ? "COMPLETED" : r.status}
                  />
                  {r.error && (
                    <p
                      className="max-w-xs truncate text-[11px] text-red-700"
                      title={r.error}
                    >
                      {r.error}
                    </p>
                  )}
                </div>
              ),
            },
            { key: "tries", header: "Attempts", render: (r) => r.attempts },
            {
              key: "at",
              header: "Finished",
              render: (r) => formatDateTime(r.finishedAt ?? r.startedAt),
            },
          ]}
        />
      )}
    </Card>
  );
}

export default function AutomationBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selected, options } = useSalesIdStore();
  const [a, setA] = useState(
    id
      ? null
      : {
          name: "",
          description: "",
          triggerType: "LEAD_CREATED",
          triggerConfig: {},
          smtpAccountId: "",
          allowReentry: false,
          steps: [],
          ownerWorkspaceId: selected !== "all" ? selected : "",
          status: "DRAFT",
        },
  );
  const [lists, setLists] = useState([]);
  const [smtp, setSmtp] = useState([]);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [enrollIds, setEnrollIds] = useState([]);
  const load = () =>
    automationService
      .get(id)
      .then((r) =>
        setA({
          ...r.data.data,
          ownerWorkspaceId: r.data.data.ownerWorkspace.id,
          smtpAccountId: r.data.data.smtpAccountId ?? "",
          triggerConfig: r.data.data.triggerConfig ?? {},
        }),
      );
  useEffect(() => {
    if (id) load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!a?.ownerWorkspaceId) return;
    api
      .get("/email-lists", {
        params: { pageSize: 100 },
        headers: { "X-Sales-Id": a.ownerWorkspaceId },
      })
      .then((r) => setLists(r.data.data));
    api
      .get("/campaigns/eligible-smtp", {
        params: { workspaceId: a.ownerWorkspaceId },
      })
      .then((r) => setSmtp(r.data.data));
  }, [a?.ownerWorkspaceId]);
  if (!a) return <Loading />;
  const locked = a.status === "ACTIVE";
  const h = { headers: { "X-Sales-Id": a.ownerWorkspaceId } };
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: a.name,
        description: a.description || null,
        triggerType: a.triggerType,
        triggerConfig: Object.keys(a.triggerConfig).length
          ? a.triggerConfig
          : null,
        smtpAccountId: a.smtpAccountId || null,
        allowReentry: a.allowReentry,
        ...(locked
          ? {}
          : {
              steps: a.steps.map((s) => ({ type: s.type, config: s.config })),
            }),
      };
      if (id) {
        await api.put(`/automations/${id}`, body, h);
        toast("Saved");
        load();
      } else {
        const r = await api.post(
          "/automations",
          { ...body, ownerWorkspaceId: a.ownerWorkspaceId },
          h,
        );
        toast("Automation created");
        navigate(`/automations/${r.data.data.id}`, { replace: true });
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (fn, msg) => {
    try {
      await fn(id);
      toast(msg);
      load();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  const moveStep = (i, d) => {
    const s = [...a.steps];
    [s[i], s[i + d]] = [s[i + d], s[i]];
    setA({ ...a, steps: s });
  };
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        back={
          <Link
            to="/automations"
            className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"
          >
            <FiArrowLeft /> Automations
          </Link>
        }
        title={id ? a.name : "New automation"}
        subtitle={id && <StatusBadge value={a.status} />}
        actions={
          <>
            <button
              className="btn-secondary"
              disabled={busy || !a.name || !a.ownerWorkspaceId}
              onClick={save}
            >
              <FiSave /> Save
            </button>
            {id && a.status !== "ACTIVE" && (
              <button
                className="btn-primary"
                onClick={() =>
                  setStatus(automationService.activate, "Automation is live")
                }
              >
                <FiPlay /> Activate
              </button>
            )}
            {id && a.status === "ACTIVE" && (
              <button
                className="btn-secondary"
                onClick={() => setStatus(automationService.pause, "Paused")}
              >
                <FiPause /> Pause
              </button>
            )}
            {id && (
              <button
                className="btn-secondary text-red-700"
                onClick={() => setDel(true)}
                aria-label="Delete"
              >
                <FiTrash2 />
              </button>
            )}
          </>
        }
      />
      {locked && (
        <Alert tone="blue">
          Pause the automation to change its steps. People already enrolled
          continue from where they are.
        </Alert>
      )}
      <Card title="Trigger">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            label="Name"
            required
            value={a.name}
            onChange={(e) => setA({ ...a, name: e.target.value })}
          />
          <Select
            label="Sales ID"
            required
            disabled={!!id}
            value={a.ownerWorkspaceId}
            onChange={(e) => setA({ ...a, ownerWorkspaceId: e.target.value })}
            options={options
              .filter((o) => o.status === "ACTIVE")
              .map((o) => [o.id, `${o.code} · ${o.name}`])}
          />
          <Select
            label="Start when"
            placeholder={false}
            value={a.triggerType}
            onChange={(e) =>
              setA({ ...a, triggerType: e.target.value, triggerConfig: {} })
            }
            options={TRIGGERS}
          />
          {a.triggerType === "LIST_JOINED" && (
            <Select
              label="List"
              required
              value={a.triggerConfig.listId ?? ""}
              onChange={(e) =>
                setA({ ...a, triggerConfig: { listId: e.target.value } })
              }
              options={lists.map((l) => [l.id, l.name])}
            />
          )}
          {a.triggerType === "LEAD_STATUS_CHANGED" && (
            <Select
              label="New status"
              value={a.triggerConfig.status ?? ""}
              placeholder="Any status"
              onChange={(e) =>
                setA({
                  ...a,
                  triggerConfig: e.target.value
                    ? { status: e.target.value }
                    : {},
                })
              }
              options={LEAD_STATUSES}
            />
          )}
          {a.triggerType === "LEAD_CREATED" && (
            <TextInput
              label="Only for lead source (optional)"
              value={a.triggerConfig.source ?? ""}
              onChange={(e) =>
                setA({
                  ...a,
                  triggerConfig: e.target.value
                    ? { source: e.target.value }
                    : {},
                })
              }
            />
          )}
          <Select
            label="Send emails from"
            value={a.smtpAccountId}
            placeholder="Any SMTP account of this Sales ID"
            onChange={(e) => setA({ ...a, smtpAccountId: e.target.value })}
            options={smtp.map((s) => [s.id, `${s.name} (${s.fromEmail})`])}
          />
          <TextInput
            label="Description"
            value={a.description ?? ""}
            onChange={(e) => setA({ ...a, description: e.target.value })}
          />
          <Checkbox
            label="Allow the same person to go through it more than once"
            checked={a.allowReentry}
            onChange={(e) => setA({ ...a, allowReentry: e.target.checked })}
          />
        </div>
      </Card>
      <Card title="Steps">
        <div className="space-y-3">
          {a.steps.length === 0 && (
            <p className="text-sm text-ink-500">Add the first step below.</p>
          )}
          {a.steps.map((s, i) => (
            <StepEditor
              key={i}
              step={s}
              index={i}
              total={a.steps.length}
              disabled={locked}
              onChange={(ns) =>
                setA({ ...a, steps: a.steps.map((x, j) => (j === i ? ns : x)) })
              }
              onMove={(d) => moveStep(i, d)}
              onRemove={() =>
                setA({ ...a, steps: a.steps.filter((_, j) => j !== i) })
              }
            />
          ))}
          {!locked && (
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.entries(STEP_TYPES).map(([type, T]) => (
                <button
                  key={type}
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    setA({
                      ...a,
                      steps: [...a.steps, { type, config: { ...T.config } }],
                    })
                  }
                >
                  <T.icon /> {T.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-500">
            Emails skip unsubscribed or suppressed people and people without
            required consent; nothing is added under your text except your
            company name/address if set on the Sales ID.
          </p>
        </div>
      </Card>
      {id && a.status === "ACTIVE" && (
        <Card title="Enrol people manually">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <RecordPicker
                label="Contact"
                endpoint="/contacts"
                value={null}
                onChange={(cid) =>
                  cid && setEnrollIds([...new Set([...enrollIds, cid])])
                }
                display={(c) =>
                  `${fullName(c)} ${c.email ? `<${c.email}>` : ""}`
                }
              />
            </div>
            <button
              className="btn-primary"
              disabled={!enrollIds.length}
              onClick={() =>
                automationService
                  .enroll(id, { contactIds: enrollIds })
                  .then((r) => {
                    toast(
                      `${r.data.data.enrolled} enrolled, ${r.data.data.skipped} skipped`,
                    );
                    setEnrollIds([]);
                  })
                  .catch((e) => toast(errorMessage(e), "error"))
              }
            >
              Enrol {enrollIds.length || ""}
            </button>
          </div>
          {enrollIds.length > 0 && (
            <p className="mt-2 text-xs text-ink-500">
              <Badge>{enrollIds.length} selected</Badge>
            </p>
          )}
        </Card>
      )}
      {id && <Logs id={id} />}
      <ConfirmDialog
        open={del}
        title="Delete this automation?"
        message="People part-way through it stop receiving its emails."
        confirmLabel="Delete"
        onClose={() => setDel(false)}
        onConfirm={() =>
          automationService
            .remove(id)
            .then(() => {
              toast("Deleted");
              navigate("/automations");
            })
            .catch((e) => toast(errorMessage(e), "error"))
        }
      />
    </div>
  );
}
