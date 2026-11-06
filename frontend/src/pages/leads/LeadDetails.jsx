import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { FiCheckCircle } from "react-icons/fi";
import { leadService } from "./services/leadService";
import { useApi } from "../../hooks/useApi";
import RecordHeader from "../../components/common/RecordHeader";
import { RecordTimeline } from "../../components/common/RecordTools";
import {
  Loading,
  ErrorState,
  Card,
  DefinitionList,
  StatusBadge,
  Tabs,
  Modal,
  Badge,
  EmptyState,
} from "../../components/common/ui";
import {
  TextInput,
  CurrencySelect,
  Checkbox,
} from "../../components/forms/fields";
import { countryName } from "../../constants/options";
import { formatDate, formatDateTime, formatMoney } from "../../utils/format";
import { errorMessage } from "../../services/axiosInstance";
import { toast } from "../../store/uiStore";
import TaskQuickAdd from "../tasks/components/TaskQuickAdd";

function ConvertModal({ lead, open, onClose, onDone }) {
  const [withDeal, setWithDeal] = useState(true);
  const [deal, setDeal] = useState({
    title: `${lead.companyName ?? lead.fullName} – deal`,
    amount: "",
    currency: "",
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await leadService.convert(lead.id, {
        createCompany: true,
        ...(withDeal
          ? {
              deal: {
                title: deal.title,
                amount: deal.amount || "0",
                currency: deal.currency || undefined,
              },
            }
          : {}),
      });
      toast("Lead converted");
      onDone(r.data.data);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convert lead"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={submit}>
            Convert
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-700">
        Creates a contact
        {lead.companyName ? ` and the company “${lead.companyName}”` : ""} in{" "}
        {lead.ownerWorkspace.code}. If a contact with this email already exists
        it is linked instead.
      </p>
      <Checkbox
        label="Also create a deal"
        checked={withDeal}
        onChange={(e) => setWithDeal(e.target.checked)}
      />
      {withDeal && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput
            className="sm:col-span-3"
            label="Deal title"
            value={deal.title}
            onChange={(e) => setDeal({ ...deal, title: e.target.value })}
          />
          <TextInput
            className="sm:col-span-2"
            label="Amount"
            inputMode="decimal"
            placeholder="0.00"
            value={deal.amount}
            onChange={(e) => setDeal({ ...deal, amount: e.target.value })}
          />
          <CurrencySelect
            label="Currency"
            value={deal.currency}
            onChange={(e) => setDeal({ ...deal, currency: e.target.value })}
            placeholder="Default"
          />
        </div>
      )}
    </Modal>
  );
}

export default function LeadDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("activity");
  const [convert, setConvert] = useState(false);
  const {
    data: l,
    loading,
    error,
    reload,
  } = useApi(() => leadService.get(id), [id]);
  if (loading && !l) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const canEdit = ["ACCOUNT", "OWNER", "COLLABORATE"].includes(l.access);
  return (
    <div>
      <RecordHeader
        entity="leads"
        record={l}
        title={l.fullName}
        backTo="/leads"
        backLabel="Leads"
        onEdit={() => navigate(`/leads/${id}/edit`)}
        onChanged={reload}
        subtitle={
          <>
            <StatusBadge value={l.status} />
            <StatusBadge value={l.priority} />
            <Badge>Score {l.score}</Badge>
          </>
        }
        extra={
          canEdit &&
          l.status !== "CONVERTED" && (
            <button className="btn-primary" onClick={() => setConvert(true)}>
              <FiCheckCircle /> Convert
            </button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card title="Contact information">
            <DefinitionList
              items={[
                [
                  "Email",
                  l.email ? (
                    <a className="link" href={`mailto:${l.email}`}>
                      {l.email}
                    </a>
                  ) : null,
                ],
                ["CC Mail", l.ccEmails?.length ? l.ccEmails.join(", ") : null],
                ["Phone", l.phoneE164 ?? l.phoneRaw],
                [
                  "Company",
                  l.company ? (
                    <Link className="link" to={`/companies/${l.company.id}`}>
                      {l.company.name}
                    </Link>
                  ) : (
                    l.companyName
                  ),
                ],
                ["Designation", l.designation],
                ["Website", l.website],
                ["Country", l.countryCode ? countryName(l.countryCode) : null],
                ["City", [l.city, l.region].filter(Boolean).join(", ") || null],
                [
                  "Timezone",
                  l.timezone
                    ? `${l.timezone} (${l.timezoneSource.toLowerCase()})`
                    : "Account default",
                ],
                ["Source", l.source],
                ["Created", formatDateTime(l.createdAt)],
                [
                  "Tags",
                  l.tags.length ? l.tags.map((t) => t.name).join(", ") : null,
                ],
                l.contact && [
                  "Converted to",
                  <Link className="link" to={`/contacts/${l.contact.id}`}>
                    {[l.contact.firstName, l.contact.lastName].join(" ")}
                  </Link>,
                ],
              ]}
            />
            {l.description && (
              <p className="mt-4 whitespace-pre-wrap border-t border-ink-100 pt-3 text-sm text-ink-700">
                {l.description}
              </p>
            )}
          </Card>
          <Card title="Sales follow-up">
            <DefinitionList
              items={[
                ["Response status", l.responseStatus],
                ["Call status", l.callStatus],
                [
                  "Basic package",
                  l.basicPriceMinor !== null && l.basicPriceMinor !== undefined
                    ? formatMoney(l.basicPriceMinor, l.priceCurrency)
                    : null,
                ],
                [
                  "Premium package",
                  l.premiumPriceMinor !== null &&
                  l.premiumPriceMinor !== undefined
                    ? formatMoney(l.premiumPriceMinor, l.priceCurrency)
                    : null,
                ],
                [
                  "Data count",
                  l.dataCount !== null && l.dataCount !== undefined
                    ? Number(l.dataCount).toLocaleString("en-IN") + " rows"
                    : null,
                ],
              ]}
            />
            {[
              ["Call notes", l.callNotes],
              ["Previous pitch", l.previousPitch],
              ["Follow-up pitch", l.followUpPitch],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="mt-3 border-t border-ink-100 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    {k}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">
                    {v}
                  </p>
                </div>
              ))}
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card bodyClass="p-4">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "activity", label: "Notes & activity" },
                { value: "tasks", label: "Follow-ups", count: l.tasks.length },
                { value: "deals", label: "Deals", count: l.deals.length },
              ]}
            />
            {tab === "activity" && (
              <RecordTimeline
                entity="leads"
                entityType="LEAD"
                id={id}
                canEdit={canEdit}
              />
            )}
            {tab === "tasks" && (
              <TaskQuickAdd
                link={{ leadId: id }}
                tasks={l.tasks}
                onChanged={reload}
              />
            )}
            {tab === "deals" &&
              (l.deals.length ? (
                <ul className="divide-y divide-ink-100">
                  {l.deals.map((d) => (
                    <li
                      key={d.id}
                      className="flex justify-between py-2 text-sm"
                    >
                      <Link className="link" to={`/deals/${d.id}`}>
                        {d.title}
                      </Link>
                      <span>
                        {formatMoney(d.amountMinor, d.currency)} ·{" "}
                        <StatusBadge value={d.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No deals yet"
                  description="Convert the lead to create one."
                />
              ))}
          </Card>
        </div>
      </div>
      {convert && (
        <ConvertModal
          lead={l}
          open
          onClose={() => setConvert(false)}
          onDone={() => {
            setConvert(false);
            reload();
          }}
        />
      )}
      <p className="mt-4 text-xs text-ink-400">
        Last updated {formatDate(l.updatedAt)}
      </p>
    </div>
  );
}
