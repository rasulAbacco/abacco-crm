// Campaign builder: details → audience → SMTP → content → sending options → review.
import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
  Link,
  useSearchParams,
} from "react-router-dom";
import { FiArrowLeft, FiCheck, FiSend, FiSave } from "react-icons/fi";
import { campaignService } from "./services/campaignService";
import SenderPicker from "./components/SenderPicker";
import SubjectField from "./components/SubjectField";
import api, { errorMessage } from "../../services/axiosInstance";
import { useSalesIdStore } from "../../store/salesIdStore";
import { useAuthStore } from "../../store/authStore";
import { toast } from "../../store/uiStore";
import EmailEditor from "../../components/forms/EmailEditor";
import {
  PageHeader,
  Card,
  Loading,
  Alert,
  Spinner,
  Badge,
  Modal,
} from "../../components/common/ui";
import {
  TextInput,
  TextArea,
  Select,
  Checkbox,
  TimezoneSelect,
  CurrencySelect,
  Field,
  TagInput,
} from "../../components/forms/fields";
import { COUNTRIES } from "../../constants/options";
import {
  minorToInput,
  formatDateTime,
  toLocalInput,
  fromLocalInput,
  num,
  humanize,
} from "../../utils/format";

const STEPS = [
  "Details",
  "Audience",
  "Send from",
  "Content",
  "Sending",
  "Review",
];

function blank(ws) {
  return {
    name: "",
    description: "",
    ownerWorkspaceId: ws,
    subject: "",
    preheader: "",
    fromName: "",
    replyTo: "",
    templateId: "",
    html: "",
    listIds: [],
    smtpAccountIds: [],
    includeCc: true,
    segmentFilter: { countryCodes: [], tags: [], excludeTags: [] },
    trackOpens: true,
    trackClicks: true,
    scheduleMode: "IMMEDIATE",
    scheduledAt: "",
    localSendDate: "",
    localSendTime: "09:00",
    fallbackTimezone: "",
    pastTimeBehaviour: "NEXT_DAY",
    respectBusinessHours: false,
    pitchAmount: "",
    pitchCurrency: "",
    pitchPriceNote: "",
  };
}

function fromCampaign(c) {
  return {
    ...blank(c.ownerWorkspaceId),
    ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null)),
    listIds: c.lists.map((l) => l.id),
    smtpAccountIds: c.smtpAccounts.map((s) => s.id),
    segmentFilter: {
      countryCodes: [],
      tags: [],
      excludeTags: [],
      ...(c.segmentFilter ?? {}),
    },
    scheduledAt: toLocalInput(c.scheduledAtUtc),
    localSendDate: c.localSendDate?.slice(0, 10) ?? "",
    pitchAmount: c.pitchAmountMinor
      ? minorToInput(c.pitchAmountMinor, c.pitchCurrency)
      : "",
    pitchCurrency: c.pitchCurrency ?? "",
    templateId: c.templateId ?? "",
  };
}

export default function CreateCampaign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { selected, options } = useSalesIdStore();
  const userTz = useAuthStore(
    (s) =>
      s.user?.timezone ?? s.user?.account?.defaultTimezone ?? "Asia/Kolkata",
  );
  const [step, setStep] = useState(0);
  // Opened from Leads → "Email selected": preselect that Sales ID and list.
  const [search] = useSearchParams();
  const [c, setC] = useState(() => {
    if (id) return null;
    const presetWs = search.get("salesId");
    const presetList = search.get("listId");
    const base = blank(presetWs || (selected !== "all" ? selected : ""));
    if (presetList) {
      base.listIds = [presetList];
      base.name = search.get("name")
        ? `Pitch – ${search.get("name")}`
        : base.name;
    }
    return base;
  });
  const [campaignId, setCampaignId] = useState(id ?? null);
  const [lists, setLists] = useState([]);
  const [smtp, setSmtp] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [segCountry, setSegCountry] = useState("");
  const set = (patch) => setC((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (id)
      campaignService.get(id).then((r) => {
        if (r.data.data.status !== "DRAFT")
          navigate(`/campaigns/${id}`, { replace: true });
        else setC(fromCampaign(r.data.data));
      });
  }, [id, navigate]);
  useEffect(() => {
    if (!c?.ownerWorkspaceId) return;
    const h = { headers: { "X-Sales-Id": c.ownerWorkspaceId } };
    api
      .get("/email-lists", { params: { pageSize: 100 }, ...h })
      .then((r) => setLists(r.data.data));
    campaignService.eligibleSmtp(c.ownerWorkspaceId).then((r) => {
      const accounts = r.data.data;
      setSmtp(accounts);
      // Default sender: the Sales ID's main email (else its alternate).
      setC((prev) => {
        if (!prev || prev.smtpAccountIds.length) return prev;
        const def =
          accounts.find((a) => a.role === "MAIN" && a.isEnabled) ??
          accounts.find((a) => a.role === "ALTERNATE" && a.isEnabled);
        return def ? { ...prev, smtpAccountIds: [def.id] } : prev;
      });
    });
    api
      .get("/templates", { params: { pageSize: 100 }, ...h })
      .then((r) => setTemplates(r.data.data));
  }, [c?.ownerWorkspaceId]);
  if (!c) return <Loading />;

  const body = () => {
    const b = {
      name: c.name,
      description: c.description || null,
      subject: c.subject || null,
      preheader: c.preheader || null,
      fromName: c.fromName || null,
      replyTo: c.replyTo || null,
      templateId: c.templateId || null,
      html: c.html || null,
      listIds: c.listIds,
      smtpAccountIds: c.smtpAccountIds,
      includeCc: c.includeCc,
      trackOpens: c.trackOpens,
      trackClicks: c.trackClicks,
      scheduleMode: c.scheduleMode,
      segmentFilter: {
        countryCodes: c.segmentFilter.countryCodes,
        tags: c.segmentFilter.tags,
        excludeTags: c.segmentFilter.excludeTags,
      },
      scheduledAt:
        c.scheduleMode === "FIXED_TIME" ? fromLocalInput(c.scheduledAt) : null,
      localSendDate:
        c.scheduleMode === "RECIPIENT_LOCAL" ? c.localSendDate || null : null,
      localSendTime:
        c.scheduleMode === "RECIPIENT_LOCAL" ? c.localSendTime || null : null,
      fallbackTimezone: c.fallbackTimezone || null,
      pastTimeBehaviour: c.pastTimeBehaviour,
      respectBusinessHours: c.respectBusinessHours,
      pitchAmount: c.pitchAmount || null,
      pitchCurrency: c.pitchCurrency || null,
      pitchPriceNote: c.pitchPriceNote || null,
    };
    return b;
  };
  const saveDraft = async (quiet) => {
    if (!c.name || !c.ownerWorkspaceId) {
      toast("Enter a name and choose a Sales ID", "error");
      return null;
    }
    setBusy(true);
    try {
      const h = { headers: { "X-Sales-Id": c.ownerWorkspaceId } };
      const r = campaignId
        ? await api.put(`/campaigns/${campaignId}`, body(), h)
        : await api.post(
            "/campaigns",
            { ...body(), ownerWorkspaceId: c.ownerWorkspaceId },
            h,
          );
      if (!campaignId) {
        setCampaignId(r.data.data.id);
        window.history.replaceState(
          null,
          "",
          `/campaigns/${r.data.data.id}/edit`,
        );
      }
      if (!quiet) toast("Draft saved");
      return r.data.data.id;
    } catch (err) {
      toast(errorMessage(err), "error");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const goReview = async () => {
    const cid = await saveDraft(true);
    if (!cid) return;
    setStep(5);
    setPreview(null);
    api
      .get(`/campaigns/${cid}/preview`, {
        headers: { "X-Sales-Id": c.ownerWorkspaceId },
      })
      .then((r) => setPreview(r.data.data))
      .catch((e) => toast(errorMessage(e), "error"));
  };
  const launch = async () => {
    setBusy(true);
    try {
      const r = await api.post(
        `/campaigns/${campaignId}/send`,
        {},
        { headers: { "X-Sales-Id": c.ownerWorkspaceId } },
      );
      toast(
        r.data.data.status === "SCHEDULED"
          ? "Campaign scheduled"
          : "Campaign is sending",
      );
      navigate(`/campaigns/${campaignId}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const sendTest = async () => {
    const cid = await saveDraft(true);
    if (!cid) return;
    try {
      const r = await api.post(
        `/campaigns/${cid}/test`,
        { to: testTo.split(/[\s,]+/).filter(Boolean) },
        { headers: { "X-Sales-Id": c.ownerWorkspaceId } },
      );
      const failed = r.data.data.results.filter((x) => !x.ok);
      toast(
        failed.length
          ? `Test failed: ${failed[0].error}`
          : `Test sent via ${r.data.data.smtpAccount.name}`,
        failed.length ? "error" : "success",
      );
      if (!failed.length) setTestOpen(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  const next = () => (step === 4 ? goReview() : setStep(step + 1));
  const canNext =
    [
      !!c.name && !!c.ownerWorkspaceId,
      c.listIds.length > 0,
      c.smtpAccountIds.length > 0,
      !!c.subject && !!c.html,
      true,
    ][step] ?? true;
  const toggle = (k, v) =>
    set({ [k]: c[k].includes(v) ? c[k].filter((x) => x !== v) : [...c[k], v] });

  return (
    <div className="max-w-5xl">
      <PageHeader
        back={
          <Link
            to="/campaigns"
            className="mb-1 inline-flex items-center gap-1 text-xs text-ink-500"
          >
            <FiArrowLeft /> Campaigns
          </Link>
        }
        title={campaignId ? c.name || "Edit campaign" : "New campaign"}
        actions={
          <>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => setTestOpen(true)}
            >
              Send test
            </button>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => saveDraft()}
            >
              <FiSave /> Save draft
            </button>
          </>
        }
      />
      <ol className="mb-5 flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => (i === 5 ? goReview() : setStep(i))}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${i === step ? "bg-brand-700 text-white" : i < step ? "bg-brand-50 text-brand-800" : "bg-ink-100 text-ink-500"}`}
            >
              {i < step ? <FiCheck /> : <span>{i + 1}</span>} {s}
            </button>
          </li>
        ))}
      </ol>
      <Card>
        {step === 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextInput
              label="Campaign name"
              required
              value={c.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            <Select
              label="Sales ID"
              required
              value={c.ownerWorkspaceId}
              disabled={!!campaignId}
              onChange={(e) =>
                set({
                  ownerWorkspaceId: e.target.value,
                  listIds: [],
                  smtpAccountIds: [],
                  templateId: "",
                })
              }
              options={options
                .filter((o) => o.status === "ACTIVE")
                .map((o) => [o.id, `${o.code} · ${o.name}`])}
              hint="Lists, SMTP accounts and templates come from this Sales ID"
            />
            <TextArea
              className="sm:col-span-2"
              label="Description (internal)"
              value={c.description}
              onChange={(e) => set({ description: e.target.value })}
            />
            <Field
              label="Pitch price (optional)"
              hint="Typed by you for reference and reports; never calculated or converted."
              className="sm:col-span-2"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input
                  className="input sm:col-span-2"
                  inputMode="decimal"
                  placeholder="Amount, e.g. 49999.00"
                  value={c.pitchAmount}
                  onChange={(e) => set({ pitchAmount: e.target.value })}
                />
                <CurrencySelect
                  value={c.pitchCurrency}
                  onChange={(e) => set({ pitchCurrency: e.target.value })}
                  placeholder="Currency"
                />
                <input
                  className="input"
                  placeholder="Note, e.g. per year"
                  value={c.pitchPriceNote}
                  onChange={(e) => set({ pitchPriceNote: e.target.value })}
                />
              </div>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-5">
            <Field label="Recipient lists">
              {lists.length === 0 ? (
                <Alert>
                  No lists in this Sales ID yet.{" "}
                  <Link className="link" to="/email-lists">
                    Create one
                  </Link>
                  .
                </Alert>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {lists.map((l) => (
                    <label
                      key={l.id}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${c.listIds.includes(l.id) ? "border-brand-600 bg-brand-50" : "border-ink-200"}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={c.listIds.includes(l.id)}
                          onChange={() => toggle("listIds", l.id)}
                        />
                        <span className="text-sm font-medium">{l.name}</span>
                      </span>
                      <span className="text-xs text-ink-500">
                        {num(l.counts.SUBSCRIBED)} subscribed
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Field>
            <div className="rounded-lg border border-ink-200 p-4">
              <p className="mb-3 text-sm font-semibold">Segment (optional)</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Only these countries">
                  <select
                    className="input"
                    value={segCountry}
                    onChange={(e) => {
                      const k = e.target.value;
                      setSegCountry("");
                      if (k && !c.segmentFilter.countryCodes.includes(k))
                        set({
                          segmentFilter: {
                            ...c.segmentFilter,
                            countryCodes: [...c.segmentFilter.countryCodes, k],
                          },
                        });
                    }}
                  >
                    <option value="">
                      {c.segmentFilter.countryCodes.length
                        ? "Add another country…"
                        : "All countries"}
                    </option>
                    {COUNTRIES.map(([k, n]) => (
                      <option key={k} value={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.segmentFilter.countryCodes.map((k) => (
                      <button
                        key={k}
                        className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-800"
                        onClick={() =>
                          set({
                            segmentFilter: {
                              ...c.segmentFilter,
                              countryCodes: c.segmentFilter.countryCodes.filter(
                                (x) => x !== k,
                              ),
                            },
                          })
                        }
                      >
                        {k} ×
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="space-y-3">
                  <TagInput
                    label="Must have tags"
                    value={c.segmentFilter.tags}
                    onChange={(tags) =>
                      set({ segmentFilter: { ...c.segmentFilter, tags } })
                    }
                  />
                  <TagInput
                    label="Exclude tags"
                    value={c.segmentFilter.excludeTags}
                    onChange={(excludeTags) =>
                      set({
                        segmentFilter: { ...c.segmentFilter, excludeTags },
                      })
                    }
                  />
                </div>
              </div>
            </div>
            {c.segmentFilter.countryCodes.length +
              c.segmentFilter.tags.length +
              c.segmentFilter.excludeTags.length >
              0 && (
              <Alert>
                Segment active: only list members matching <b>all</b> these
                filters will receive the campaign. Tags must exactly match tags
                on the contacts.{" "}
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    set({
                      segmentFilter: {
                        countryCodes: [],
                        tags: [],
                        excludeTags: [],
                      },
                    })
                  }
                >
                  Clear segment
                </button>
              </Alert>
            )}
            <Alert tone="blue">
              Unsubscribed, bounced and suppressed people are always excluded,
              and so is anyone without recorded consent in countries that
              require it.
            </Alert>
          </div>
        )}
        {step === 2 && (
          <SenderPicker
            smtp={smtp}
            value={c.smtpAccountIds[0] ?? ""}
            onChange={(sid) => set({ smtpAccountIds: [sid] })}
            includeCc={c.includeCc !== false}
            onIncludeCc={(v) => set({ includeCc: v })}
            salesIdCode={
              options.find((o) => o.id === c.ownerWorkspaceId)?.code ?? ""
            }
          />
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Start from a template"
                value={c.templateId}
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  set({ templateId: e.target.value });
                  if (t)
                    api
                      .get(`/templates/${t.id}`, {
                        headers: { "X-Sales-Id": c.ownerWorkspaceId },
                      })
                      .then((r) =>
                        set({
                          html: r.data.data.html,
                          subject: c.subject || r.data.data.subject || "",
                        }),
                      );
                }}
                options={templates.map((t) => [t.id, t.name])}
                placeholder="Blank"
              />
              <SubjectField
                key={c.id ?? "new"}
                value={c.subject}
                onChange={(subject) => set({ subject })}
                preferOwn={!!search.get("listId")}
              />
              <TextInput
                label="Preheader (inbox preview text)"
                value={c.preheader}
                onChange={(e) => set({ preheader: e.target.value })}
              />
              <TextInput
                label="From name"
                value={c.fromName}
                onChange={(e) => set({ fromName: e.target.value })}
                placeholder="Defaults to the SMTP account's name"
              />
              <TextInput
                label="Reply-to email"
                type="email"
                value={c.replyTo}
                onChange={(e) => set({ replyTo: e.target.value })}
              />
            </div>
            <EmailEditor value={c.html} onChange={(html) => set({ html })} />
          </div>
        )}
        {step === 4 && (
          <div className="space-y-5">
            <Field label="When to send">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  ["IMMEDIATE", "Now", "Start as soon as you confirm"],
                  ["FIXED_TIME", "At a set time", "One moment for everyone"],
                  [
                    "RECIPIENT_LOCAL",
                    "In each recipient's local time",
                    "e.g. 09:00 in New York, London and Mumbai",
                  ],
                ].map(([v, l, d]) => (
                  <label
                    key={v}
                    className={`cursor-pointer rounded-lg border p-3 ${c.scheduleMode === v ? "border-brand-600 bg-brand-50" : "border-ink-200"}`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      checked={c.scheduleMode === v}
                      onChange={() => set({ scheduleMode: v })}
                    />
                    <span className="text-sm font-medium">{l}</span>
                    <span className="mt-1 block text-xs text-ink-500">{d}</span>
                  </label>
                ))}
              </div>
            </Field>
            {c.scheduleMode === "FIXED_TIME" && (
              <TextInput
                label={`Send at (your time, ${userTz})`}
                type="datetime-local"
                value={c.scheduledAt}
                onChange={(e) => set({ scheduledAt: e.target.value })}
                className="max-w-xs"
              />
            )}
            {c.scheduleMode === "RECIPIENT_LOCAL" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextInput
                  label="Local date"
                  type="date"
                  value={c.localSendDate}
                  onChange={(e) => set({ localSendDate: e.target.value })}
                />
                <TextInput
                  label="Local time"
                  type="time"
                  value={c.localSendTime}
                  onChange={(e) => set({ localSendTime: e.target.value })}
                />
                <TimezoneSelect
                  label="Timezone for people without one"
                  value={c.fallbackTimezone}
                  onChange={(e) => set({ fallbackTimezone: e.target.value })}
                  placeholder="Sales ID / account default"
                />
                <Select
                  label="If that local time has already passed"
                  value={c.pastTimeBehaviour}
                  placeholder={false}
                  onChange={(e) => set({ pastTimeBehaviour: e.target.value })}
                  options={[
                    ["NEXT_DAY", "Send the next day at that time"],
                    ["SEND_NOW", "Send immediately"],
                    ["SKIP", "Skip that recipient"],
                  ]}
                />
              </div>
            )}
            <Checkbox
              label="Only send during business hours in the recipient's country"
              hint="Uses each country's hours, working days and holidays (Settings → Countries)."
              checked={c.respectBusinessHours}
              onChange={(e) => set({ respectBusinessHours: e.target.checked })}
            />
            <div className="flex flex-wrap gap-6">
              <Checkbox
                label="Track opens (estimated)"
                checked={c.trackOpens}
                onChange={(e) => set({ trackOpens: e.target.checked })}
              />
              <Checkbox
                label="Track link clicks"
                checked={c.trackClicks}
                onChange={(e) => set({ trackClicks: e.target.checked })}
              />
            </div>
          </div>
        )}
        {step === 5 &&
          (!preview ? (
            <Loading label="Checking audience and settings…" />
          ) : (
            <div className="space-y-4">
              {preview.issues.length > 0 ? (
                <Alert tone="red">
                  <p className="font-medium">Fix these before sending:</p>
                  <ul className="ml-4 mt-1 list-disc">
                    {preview.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <Alert tone="green">Ready to send.</Alert>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-ink-200 p-3">
                  <p className="text-xs text-ink-500">
                    Subscribed in the selected lists
                  </p>
                  <p className="text-lg font-semibold">
                    {num(preview.summary.inLists ?? preview.summary.total)}
                  </p>
                  {preview.summary.removedBySegment > 0 && (
                    <p className="text-xs text-amber-700">
                      {num(preview.summary.removedBySegment)} removed by segment
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-800">Will receive it</p>
                  <p className="text-lg font-semibold">
                    {num(preview.summary.sendable)}
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 p-3">
                  <p className="text-xs text-ink-500">Suppressed</p>
                  <p className="text-lg font-semibold">
                    {num(preview.summary.suppressed)}
                  </p>
                </div>
                <div className="rounded-lg border border-ink-200 p-3">
                  <p className="text-xs text-ink-500">
                    Daily capacity of the sender
                  </p>
                  <p className="text-lg font-semibold">
                    {num(preview.capacityPerDay)}
                  </p>
                  {preview.estimatedDays > 1 && (
                    <p className="text-xs text-amber-700">
                      ≈ {preview.estimatedDays} days to finish
                    </p>
                  )}
                </div>
              </div>
              {Object.keys(preview.summary.skipped).length > 0 && (
                <div>
                  <p className="label">Excluded</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(preview.summary.skipped).map(([k, n]) => (
                      <Badge key={k} tone="amber">
                        {humanize(k)}: {n}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="label">Recipients by country</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(preview.summary.byCountry).map(([k, n]) => (
                    <Badge key={k}>
                      {k}: {n}
                    </Badge>
                  ))}
                </div>
              </div>
              {preview.summary.firstSendAt && (
                <p className="text-sm text-ink-700">
                  First email {formatDateTime(preview.summary.firstSendAt)}
                  {preview.summary.lastSendAt !==
                    preview.summary.firstSendAt && (
                    <>, last {formatDateTime(preview.summary.lastSendAt)}</>
                  )}{" "}
                  (your time).
                </p>
              )}
            </div>
          ))}
        <div className="mt-6 flex justify-between border-t border-ink-200 pt-4">
          <button
            className="btn-secondary"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
          {step < 5 ? (
            <button
              className="btn-primary"
              disabled={!canNext || busy}
              onClick={next}
            >
              {step === 4 ? "Review" : "Continue"}
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={
                busy ||
                !preview ||
                preview.issues.length > 0 ||
                !preview.summary.sendable
              }
              onClick={launch}
            >
              {busy ? <Spinner className="h-4 w-4" /> : <FiSend />}
              {c.scheduleMode === "IMMEDIATE"
                ? `Send to ${num(preview?.summary.sendable ?? 0)} people`
                : "Schedule campaign"}
            </button>
          )}
        </div>
      </Card>
      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Send a test email"
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => setTestOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={!testTo.trim()}
              onClick={sendTest}
            >
              Send test
            </button>
          </>
        }
      >
        <TextInput
          label="Send to (up to 5, comma separated)"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          hint="Uses sample personalisation and one of the chosen SMTP accounts. Counts towards its limits."
        />
      </Modal>
    </div>
  );
}
