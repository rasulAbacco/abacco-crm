import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiEdit2,
  FiStar,
  FiPower,
  FiTrash2,
} from "react-icons/fi";
import { salesIdService } from "./services/salesIdService";
import SalesIdForm from "./components/SalesIdForm";
import { useApi } from "../../hooks/useApi";
import { useSalesIdStore } from "../../store/salesIdStore";
import { salesIdOptions } from "../../services/commonService";
import {
  PageHeader,
  Loading,
  ErrorState,
  StatCard,
  Card,
  DefinitionList,
  StatusBadge,
  Badge,
  Modal,
  Alert,
  Spinner,
} from "../../components/common/ui";
import { Select, TextInput, TextArea } from "../../components/forms/fields";
import { formatMoneyList, formatDateTime } from "../../utils/format";
import { toast } from "../../store/uiStore";
import { errorMessage } from "../../services/axiosInstance";

export default function SalesIdDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { options, setOptions } = useSalesIdStore();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [needsTarget, setNeedsTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState(null);
  const {
    data: w,
    loading,
    error,
    reload,
  } = useApi(() => salesIdService.get(id), [id]);
  const refreshOptions = () =>
    salesIdOptions().then((r) => setOptions(r.data.data));
  const act = async (fn, msg) => {
    try {
      await fn();
      toast(msg);
      reload();
      refreshOptions();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await salesIdService.remove(id, {
        confirmCode,
        ...(transferToId ? { transferToId } : {}),
      });
      toast(`${w.code} deleted`);
      refreshOptions();
      navigate("/sales-ids");
    } catch (err) {
      const e = err.response?.data?.error;
      if (e?.code === "TRANSFER_TARGET_REQUIRED")
        setNeedsTarget(e.details.counts);
      else toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  if (loading && !w) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const s = w.stats;
  const st = hours ?? {
    businessHoursStart: w.settings?.businessHoursStart,
    businessHoursEnd: w.settings?.businessHoursEnd,
    emailFooterHtml: w.settings?.emailFooterHtml ?? "",
  };
  return (
    <div className="space-y-4">
      <PageHeader
        back={
          <Link
            to="/sales-ids"
            className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"
          >
            <FiArrowLeft /> Sales IDs
          </Link>
        }
        title={`${w.code} · ${w.name}`}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge value={w.status} />
            {w.isDefault && <Badge tone="blue">Default</Badge>}
            {w.description}
          </span>
        }
        actions={
          <>
            <button className="btn-secondary" onClick={() => setEdit(true)}>
              <FiEdit2 /> Edit
            </button>
            {!w.isDefault && w.status === "ACTIVE" && (
              <button
                className="btn-secondary"
                onClick={() =>
                  act(
                    () => salesIdService.setDefault(id),
                    "Default Sales ID changed",
                  )
                }
              >
                <FiStar /> Make default
              </button>
            )}
            {!w.isDefault && (
              <button
                className="btn-secondary"
                onClick={() =>
                  act(
                    () =>
                      salesIdService.setStatus(
                        id,
                        w.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                      ),
                    w.status === "ACTIVE" ? "Deactivated" : "Activated",
                  )
                }
              >
                <FiPower /> {w.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </button>
            )}
            {!w.isDefault && (
              <button
                className="btn-secondary text-red-700"
                onClick={() => setDel(true)}
              >
                <FiTrash2 /> Delete
              </button>
            )}
          </>
        }
      />
      {!w.primarySmtpAccountId && (
        <Alert>
          Set the <b>Main email</b> (Edit) — new campaigns of {w.code} send from
          it automatically.
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Leads" value={s.leads} />
        <StatCard label="Contacts" value={s.contacts} />
        <StatCard label="Companies" value={s.companies} />
        <StatCard label="Open deals" value={s.openDeals} />
        <StatCard
          label="Pipeline"
          value={formatMoneyList(s.pipelineValue, { compact: true })}
        />
        <StatCard
          label="Won revenue"
          tone="green"
          value={formatMoneyList(s.wonRevenue, { compact: true })}
          hint={s.winRate !== null ? `Win rate ${s.winRate}%` : undefined}
        />
        <StatCard
          label="Open tasks"
          value={s.openTasks}
          hint={`${s.overdueTasks} overdue`}
        />
        <StatCard label="Campaigns" value={s.campaigns} />
        <StatCard label="Email lists" value={s.emailLists} />
        <StatCard label="Shared with it" value={s.sharedWithMe} />
        <StatCard label="Shared by it" value={s.sharedByMe} />
        <StatCard label="SMTP accounts" value={s.smtpAccounts} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Settings">
          <DefinitionList
            items={[
              ["Default currency", w.defaultCurrency ?? "Account default"],
              ["Default timezone", w.defaultTimezone ?? "Account default"],
              ["Main email", w.primarySmtp?.fromEmail ?? "Not set"],
              ["Alternate email", w.alternateSmtp?.fromEmail ?? "Not set"],
              ["Footer company name", w.senderLegalName ?? "Not shown"],
              ["Footer address", w.senderPostalAddress ?? "Not shown"],
              ["Created", formatDateTime(w.createdAt)],
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4">
            <TextInput
              label="Business hours start"
              type="time"
              value={st.businessHoursStart}
              onChange={(e) =>
                setHours({ ...st, businessHoursStart: e.target.value })
              }
            />
            <TextInput
              label="Business hours end"
              type="time"
              value={st.businessHoursEnd}
              onChange={(e) =>
                setHours({ ...st, businessHoursEnd: e.target.value })
              }
            />
            <TextArea
              className="col-span-2"
              label="Extra footer text (optional HTML)"
              rows={2}
              value={st.emailFooterHtml}
              onChange={(e) =>
                setHours({ ...st, emailFooterHtml: e.target.value })
              }
              hint="Used when a recipient's country has no profile"
            />
          </div>
          {hours && (
            <div className="mt-3 flex justify-end">
              <button
                className="btn-primary btn-sm"
                onClick={() =>
                  act(
                    () =>
                      salesIdService.update(id, {
                        settings: {
                          businessHoursStart: hours.businessHoursStart,
                          businessHoursEnd: hours.businessHoursEnd,
                          emailFooterHtml: hours.emailFooterHtml || null,
                        },
                      }),
                    "Settings saved",
                  ).then(() => setHours(null))
                }
              >
                Save settings
              </button>
            </div>
          )}
        </Card>
        <Card
          title="Assigned SMTP accounts"
          actions={
            <Link to="/smtp-accounts" className="text-xs link">
              Manage
            </Link>
          }
        >
          {w.smtpAccounts.length === 0 ? (
            <p className="text-sm text-ink-500">
              None yet. Assign accounts under SMTP accounts.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {w.smtpAccounts.map((a) => (
                <li key={a.id} className="flex justify-between py-2 text-sm">
                  <span>
                    {a.name} <span className="text-ink-500">{a.fromEmail}</span>
                  </span>
                  <StatusBadge value={a.isEnabled ? a.health : "INACTIVE"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {edit && (
        <SalesIdForm
          open
          item={w}
          onClose={() => setEdit(false)}
          onSaved={reload}
        />
      )}
      <Modal
        open={del}
        onClose={() => {
          setDel(false);
          setNeedsTarget(null);
        }}
        title={`Delete ${w.code}?`}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDel(false)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={
                busy || confirmCode !== w.code || (needsTarget && !transferToId)
              }
              onClick={remove}
            >
              {busy && <Spinner className="h-4 w-4" />}Delete
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-700">
            The Sales ID is archived. Its code is never reused. Shares to it end
            and its SMTP assignments are removed.
          </p>
          {needsTarget && (
            <Alert>
              It still owns{" "}
              {Object.entries(needsTarget)
                .filter(([, n]) => n)
                .map(([k, n]) => `${n} ${k}`)
                .join(", ")}
              . Choose where to move them.
            </Alert>
          )}
          <Select
            label="Move its records to"
            value={transferToId}
            onChange={(e) => setTransferToId(e.target.value)}
            options={options
              .filter((o) => o.id !== id && o.status === "ACTIVE")
              .map((o) => [o.id, `${o.code} · ${o.name}`])}
            placeholder="Only needed if it has records"
          />
          <TextInput
            label={`Type ${w.code} to confirm`}
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value.trim())}
          />
        </div>
      </Modal>
    </div>
  );
}
