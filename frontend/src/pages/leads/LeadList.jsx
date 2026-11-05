import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiUserPlus, FiMail, FiSliders } from "react-icons/fi";
import RecordListPage from "../../components/common/RecordListPage";
import { StatusBadge } from "../../components/common/ui";
import { OwnerBadge } from "../../components/common/RecordTools";
import {
  ManageStatusesModal,
  EmailLeadsModal,
} from "./components/FollowUpModals";
import {
  leadService,
  useLeadOptions,
  responseTone,
} from "./services/leadService";
import {
  LEAD_STATUSES,
  PRIORITIES,
  LEAD_SOURCES,
  COUNTRIES,
  CURRENCIES,
} from "../../constants/options";
import { formatDate, formatMoney, humanize, num } from "../../utils/format";
import { toast } from "../../store/uiStore";
import { errorMessage } from "../../services/axiosInstance";

const TONE_CLASS = {
  green: "bg-green-50 text-green-800 border-green-200",
  blue: "bg-blue-50 text-blue-800 border-blue-200",
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  amber: "bg-amber-50 text-amber-900 border-amber-200",
  red: "bg-red-50 text-red-800 border-red-200",
  gray: "bg-ink-50 text-ink-700 border-ink-200",
};

/** Status shown as a small dropdown so it can be changed straight from the table. */
function InlineStatus({ lead, field, list, onChanged }) {
  const [value, setValue] = useState(lead[field] ?? "");
  const canEdit = !lead.isShared || lead.access !== "READ";
  const change = async (v) => {
    const prev = value;
    setValue(v);
    try {
      await leadService.update(lead.id, { [field]: v || null });
      onChanged?.();
    } catch (err) {
      setValue(prev);
      toast(errorMessage(err), "error");
    }
  };
  const values = value && !list.includes(value) ? [value, ...list] : list;
  return (
    <select
      aria-label={field}
      disabled={!canEdit}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => change(e.target.value)}
      className={`max-w-[11rem] rounded-md border px-1.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-200 ${field === "responseStatus" ? TONE_CLASS[responseTone(value)] : TONE_CLASS.gray}`}
    >
      <option value="">—</option>
      {values.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export default function LeadList() {
  const navigate = useNavigate();
  const [opts, , setOpts] = useLeadOptions();
  const [manage, setManage] = useState(false);
  const [emailing, setEmailing] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <>
      <RecordListPage
        entity="leads"
        title="Leads"
        subtitle="Prospects and follow-ups — change Response / Call status right in the table"
        createLabel="New lead"
        onCreate={() => navigate("/leads/new")}
        emptyIcon={FiUserPlus}
        reloadKey={reloadKey}
        importHint="Same layout as your tracker: Sales ID, Client Name, Client Email, Phone Number, Response Status, Call Status, Call Notes, Previous Pitch, Follow Up Pitch, Basic Package Price ($), Premium Package Price ($), Data Count (Rows). Rows go to the Sales ID in their own column (code like REP-101, or name)."
        templateUrl="/leads/import-template"
        importOwnerOptional
        importOptions={[
          {
            name: "createMissingSalesIds",
            label: "Create Sales IDs that do not exist yet (e.g. REP-104)",
            type: "checkbox",
          },
          {
            name: "priceCurrency",
            label: "Currency of the package prices",
            type: "select",
            default: "USD",
            options: CURRENCIES.map((c) => [c, c]),
          },
        ]}
        exportOptions={[
          {
            label: "Excel — tracker format",
            params: { format: "xlsx", layout: "client" },
          },
          {
            label: "CSV — tracker format",
            params: { format: "csv", layout: "client" },
          },
          {
            label: "Excel — all fields",
            params: { format: "xlsx", layout: "detailed" },
          },
        ]}
        extraActions={
          <button className="btn-secondary" onClick={() => setManage(true)}>
            <FiSliders /> Status lists
          </button>
        }
        filters={[
          {
            name: "responseStatus",
            label: "Response",
            options: [...opts.responseStatuses, ["(none)", "No status"]],
          },
          {
            name: "callStatus",
            label: "Call",
            options: [...opts.callStatuses, ["(none)", "No status"]],
          },
          {
            name: "status",
            label: "Stage",
            options: LEAD_STATUSES.map((s) => [s, humanize(s)]),
          },
          {
            name: "priority",
            label: "Priority",
            options: PRIORITIES.map((s) => [s, humanize(s)]),
          },
          { name: "source", label: "Source", options: LEAD_SOURCES },
          { name: "countryCode", label: "Country", options: COUNTRIES },
        ]}
        bulkPatch={(patch) => (
          <>
            <select
              className="input w-auto py-1 text-xs"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  patch({
                    responseStatus:
                      e.target.value === "(none)" ? null : e.target.value,
                  });
                e.target.value = "";
              }}
              aria-label="Set response status"
            >
              <option value="">Set response status…</option>
              {opts.responseStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="(none)">Clear</option>
            </select>
            <select
              className="input w-auto py-1 text-xs"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  patch({
                    callStatus:
                      e.target.value === "(none)" ? null : e.target.value,
                  });
                e.target.value = "";
              }}
              aria-label="Set call status"
            >
              <option value="">Set call status…</option>
              {opts.callStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="(none)">Clear</option>
            </select>
          </>
        )}
        bulkActions={({ target, count, filters }) => (
          <button
            className="btn-primary btn-sm"
            onClick={() =>
              setEmailing({
                target,
                count,
                name: `${filters.responseStatus && filters.responseStatus !== "(none)" ? filters.responseStatus : "Leads"} – ${new Date().toISOString().slice(0, 10)}`,
              })
            }
          >
            <FiMail /> Email selected
          </button>
        )}
        columns={[
          {
            key: "fullName",
            header: "Client",
            sort: "fullName",
            render: (r) => (
              <div>
                <p className="font-medium text-ink-900">{r.fullName}</p>
                <p className="text-xs text-ink-500">
                  {r.email ?? r.phoneRaw ?? ""}
                </p>
              </div>
            ),
          },
          {
            key: "phone",
            header: "Phone",
            render: (r) => (
              <span className="whitespace-nowrap text-xs">
                {r.phoneRaw ?? r.phoneE164 ?? "—"}
              </span>
            ),
          },
          {
            key: "responseStatus",
            header: "Response status",
            render: (r) => (
              <InlineStatus
                lead={r}
                field="responseStatus"
                list={opts.responseStatuses}
                onChanged={() => setReloadKey((k) => k + 1)}
              />
            ),
          },
          {
            key: "callStatus",
            header: "Call status",
            render: (r) => (
              <InlineStatus
                lead={r}
                field="callStatus"
                list={opts.callStatuses}
              />
            ),
          },
          {
            key: "followUpPitch",
            header: "Follow-up pitch",
            render: (r) => (
              <span
                className="line-clamp-2 max-w-[16rem] text-xs text-ink-700"
                title={r.followUpPitch ?? ""}
              >
                {r.followUpPitch ?? "—"}
              </span>
            ),
          },
          {
            key: "prices",
            header: "Basic / Premium",
            render: (r) =>
              r.basicPriceMinor || r.premiumPriceMinor ? (
                <span className="whitespace-nowrap text-xs">
                  {formatMoney(r.basicPriceMinor, r.priceCurrency)} /{" "}
                  {formatMoney(r.premiumPriceMinor, r.priceCurrency)}
                </span>
              ) : (
                "—"
              ),
          },
          {
            key: "dataCount",
            header: "Data rows",
            className: "text-right",
            render: (r) =>
              r.dataCount !== null && r.dataCount !== undefined
                ? num(r.dataCount)
                : "—",
          },
          {
            key: "status",
            header: "Stage",
            sort: "status",
            render: (r) => <StatusBadge value={r.status} />,
          },
          {
            key: "owner",
            header: "Sales ID",
            render: (r) => <OwnerBadge record={r} />,
          },
          {
            key: "createdAt",
            header: "Created",
            sort: "createdAt",
            render: (r) => formatDate(r.createdAt),
          },
        ]}
      />
      <ManageStatusesModal
        open={manage}
        onClose={() => setManage(false)}
        options={opts}
        onSaved={setOpts}
      />
      {emailing && (
        <EmailLeadsModal
          open
          target={emailing.target}
          count={emailing.count}
          defaultName={emailing.name}
          onClose={() => setEmailing(null)}
        />
      )}
    </>
  );
}
