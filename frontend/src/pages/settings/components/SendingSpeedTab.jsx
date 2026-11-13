// Settings → Sending speed
// One card per email account: emails per hour (spaced evenly through the hour),
// daily cap, sending days / hours, and exact or slightly varied spacing.
import { useEffect, useMemo, useState } from "react";
import api, { errorMessage } from "../../../services/axiosInstance";
import { useApi } from "../../../hooks/useApi";
import { toast } from "../../../store/uiStore";
import {
  Card,
  Spinner,
  Alert,
  Badge,
  EmptyState,
} from "../../../components/common/ui";
import { TimezoneSelect } from "../../../components/forms/fields";

const PRESETS = [15, 30, 50, 60, 100];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PROVIDER_HINT = {
  GMAIL:
    "Suggested: 100 per hour. Daily cap about 2,000 for Google Workspace, 500 for a personal Gmail.",
  ZOHO: "Suggested: 50 per hour.",
};

export function spacingText(perHour) {
  const n = Number(perHour);
  if (!n || n < 1) return "—";
  const total = Math.round(3600 / n);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (!m) return `1 email every ${s} sec`;
  return s ? `1 email every ${m} min ${s} sec` : `1 email every ${m} min`;
}

function durationText(count, perHour) {
  const n = Number(perHour);
  if (!n || !count) return "—";
  const mins = Math.ceil(((count - 1) * 3600) / n / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** One hour drawn as a line with a tick for each email. */
function HourStrip({ perHour }) {
  const n = Math.min(Math.max(Number(perHour) || 0, 0), 120);
  return (
    <div className="mt-3" aria-hidden="true">
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-2 h-px bg-ink-300" />
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            className="absolute top-0.5 h-3 w-px bg-brand-700"
            style={{ left: `${(i / Math.max(n, 1)) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-500">
        <span>0 min</span>
        <span>60 min</span>
      </div>
    </div>
  );
}

const toForm = (a) => ({
  hourlyLimit: a.hourlyLimit,
  dailyLimit: a.dailyLimit,
  mode:
    a.pacingEnabled === false
      ? "none"
      : a.paceJitterPercent > 0
        ? "vary"
        : "exact",
  paceJitterPercent: a.paceJitterPercent > 0 ? a.paceJitterPercent : 20,
  useHours: !!a.sendWindowStart,
  sendWindowStart: a.sendWindowStart ?? "09:00",
  sendWindowEnd: a.sendWindowEnd ?? "18:00",
  sendDays: a.sendDays?.length ? a.sendDays : [0, 1, 2, 3, 4, 5, 6],
  sendTimezone: a.sendTimezone ?? "",
});

function AccountCard({ account, defaultTimezone, onSaved }) {
  const [v, setV] = useState(() => toForm(account));
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(500);
  useEffect(() => setV(toForm(account)), [account]);
  const set = (patch) => setV((x) => ({ ...x, ...patch }));

  const perDay = useMemo(() => {
    const rate = Number(v.hourlyLimit) || 0;
    if (!v.useHours) return rate * 24;
    const [sh, sm] = v.sendWindowStart.split(":").map(Number);
    const [eh, em] = v.sendWindowEnd.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 1440;
    return Math.floor((mins / 60) * rate);
  }, [v]);

  const toggleDay = (d) =>
    set({
      sendDays: v.sendDays.includes(d)
        ? v.sendDays.filter((x) => x !== d)
        : [...v.sendDays, d].sort(),
    });

  async function save() {
    setBusy(true);
    try {
      const r = await api.put(`/smtp-accounts/${account.id}`, {
        hourlyLimit: Number(v.hourlyLimit),
        dailyLimit: Number(v.dailyLimit),
        pacingEnabled: v.mode !== "none",
        paceJitterPercent: v.mode === "vary" ? Number(v.paceJitterPercent) : 0,
        sendWindowStart: v.useHours ? v.sendWindowStart : null,
        sendWindowEnd: v.useHours ? v.sendWindowEnd : null,
        sendDays: v.sendDays,
        sendTimezone: v.sendTimezone || null,
      });
      onSaved(r.data.data);
      toast(
        `Saved. ${account.fromEmail} now sends ${v.mode === "none" ? `up to ${v.hourlyLimit} per hour` : spacingText(v.hourlyLimit).toLowerCase()}.`,
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const usage = account.usage ?? { lastHour: 0, last24h: 0 };
  return (
    <Card
      title={
        <span>
          {account.name}{" "}
          <span className="font-normal text-ink-500">
            · {account.fromEmail}
          </span>
        </span>
      }
      actions={
        <>
          {!account.isEnabled && <Badge tone="gray">Disabled</Badge>}
          <button
            className="btn-primary btn-sm"
            onClick={save}
            disabled={busy || !v.sendDays.length}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor={`rate-${account.id}`}>
            Emails per hour
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`rate-${account.id}`}
              type="number"
              min="1"
              max="3600"
              className="input w-24"
              value={v.hourlyLimit}
              onChange={(e) => set({ hourlyLimit: e.target.value })}
            />
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ hourlyLimit: p })}
                aria-pressed={Number(v.hourlyLimit) === p}
                className={`rounded-lg border px-3 py-1.5 text-sm ${Number(v.hourlyLimit) === p ? "border-brand-700 bg-brand-700 text-white" : "border-ink-300 text-ink-700 hover:bg-ink-50"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-ink-900">
            {v.mode === "none"
              ? `Up to ${v.hourlyLimit || 0} per hour, no spacing`
              : spacingText(v.hourlyLimit)}
          </p>
          {v.mode !== "none" && <HourStrip perHour={v.hourlyLimit} />}
          <p className="mt-3 text-xs text-ink-500">
            Sent in the last hour:{" "}
            <b className="text-ink-700">{usage.lastHour}</b>, last 24 hours:{" "}
            <b className="text-ink-700">{usage.last24h}</b>.
            {PROVIDER_HINT[account.provider] && (
              <> {PROVIDER_HINT[account.provider]}</>
            )}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor={`daily-${account.id}`}>
              Daily cap
            </label>
            <input
              id={`daily-${account.id}`}
              type="number"
              min="1"
              className="input w-32"
              value={v.dailyLimit}
              onChange={(e) => set({ dailyLimit: e.target.value })}
            />
            <p className="mt-1 text-xs text-ink-500">
              At this speed and these hours the account could send about{" "}
              {perDay.toLocaleString()} a day. It stops at{" "}
              {Number(v.dailyLimit || 0).toLocaleString()}.
            </p>
          </div>

          <fieldset>
            <legend className="label">Spacing</legend>
            <div className="space-y-1.5 text-sm text-ink-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${account.id}`}
                  checked={v.mode === "exact"}
                  onChange={() => set({ mode: "exact" })}
                />{" "}
                Exact: the same gap every time
              </label>
              <label className="flex flex-wrap items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${account.id}`}
                  checked={v.mode === "vary"}
                  onChange={() => set({ mode: "vary" })}
                />{" "}
                Vary each gap by up to
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="input w-16 py-1"
                  value={v.paceJitterPercent}
                  disabled={v.mode !== "vary"}
                  onChange={(e) => set({ paceJitterPercent: e.target.value })}
                  aria-label="Variation percent"
                />
                % (same total per hour)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${account.id}`}
                  checked={v.mode === "none"}
                  onChange={() => set({ mode: "none" })}
                />{" "}
                No spacing: only the hourly and daily limits
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Sending days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={v.sendDays.includes(i)}
                  onClick={() => toggleDay(i)}
                  className={`rounded-lg border px-2.5 py-1 text-sm ${v.sendDays.includes(i) ? "border-brand-600 bg-brand-50 text-brand-800" : "border-ink-300 text-ink-500"}`}
                >
                  {d}
                </button>
              ))}
            </div>
            {!v.sendDays.length && (
              <p className="mt-1 text-xs text-red-700">
                Pick at least one day.
              </p>
            )}
          </fieldset>

          <div>
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={v.useHours}
                onChange={(e) => set({ useHours: e.target.checked })}
              />
              Only send between
              <input
                type="time"
                className="input w-36 py-1"
                value={v.sendWindowStart}
                disabled={!v.useHours}
                onChange={(e) => set({ sendWindowStart: e.target.value })}
                aria-label="Start time"
              />
              and
              <input
                type="time"
                className="input w-36 py-1"
                value={v.sendWindowEnd}
                disabled={!v.useHours}
                onChange={(e) => set({ sendWindowEnd: e.target.value })}
                aria-label="End time"
              />
            </label>
            <div className="mt-2 max-w-xs">
              <TimezoneSelect
                label="Timezone for these days and hours"
                value={v.sendTimezone}
                onChange={(e) => set({ sendTimezone: e.target.value })}
                placeholder={`Account default (${defaultTimezone})`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-200 pt-3 text-sm text-ink-700">
        <input
          type="number"
          min="1"
          className="input w-24 py-1"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="Number of emails"
        />
        emails take about{" "}
        <b className="text-ink-900">
          {v.mode === "none" ? "—" : durationText(count, v.hourlyLimit)}
        </b>{" "}
        of sending time from this account.
      </div>
    </Card>
  );
}

export default function SendingSpeedTab() {
  const { data, loading, error, reload, setData } = useApi(
    () => api.get("/smtp-accounts"),
    [],
  );
  const account = useApi(() => api.get("/account"), []);
  const defaultTimezone = account.data?.defaultTimezone ?? "Asia/Kolkata";
  if (loading && !data) return <Spinner />;
  if (error)
    return (
      <Alert tone="red">
        {error}{" "}
        <button className="link ml-1" onClick={reload}>
          Try again
        </button>
      </Alert>
    );
  if (!data?.length)
    return (
      <EmptyState
        title="No email accounts yet"
        description="Add one under SMTP accounts, then set its sending speed here."
      />
    );
  return (
    <div className="space-y-4">
      <Alert tone="blue">
        Each email account sends its emails evenly through the hour: 60 per hour
        is one every minute, 30 per hour is one every 2 minutes. Campaigns that
        use the same account share its speed. A new speed applies from the next
        email.
      </Alert>
      {data.map((a) => (
        <AccountCard
          key={a.id}
          account={a}
          defaultTimezone={defaultTimezone}
          onSaved={(s) =>
            setData(
              data.map((x) =>
                x.id === s.id ? { ...x, ...s, usage: x.usage } : x,
              ),
            )
          }
        />
      ))}
    </div>
  );
}
