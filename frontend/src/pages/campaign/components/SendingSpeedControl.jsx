// Sending speed dropdown for the campaign's sender (Review step and campaign page).
// It changes the email account's own speed, so every campaign using that account follows it.
// Full settings (days, hours, spacing) stay under Settings → Sending speed.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiZap } from "react-icons/fi";
import api, { errorMessage } from "../../../services/axiosInstance";
import { toast } from "../../../store/uiStore";
import { num } from "../../../utils/format";

export const SPEED_OPTIONS = [
  10, 15, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200,
];

export function spacingText(perHour) {
  const n = Number(perHour);
  if (!n || n < 1) return "—";
  const total = Math.round(3600 / n);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (!m) return `1 email every ${s} sec`;
  return s ? `1 email every ${m} min ${s} sec` : `1 email every ${m} min`;
}

/** Rough sending time for `count` emails at this speed, respecting the daily cap. */
export function finishText(count, perHour, perDay, paced = true) {
  if (!count || !perHour) return null;
  if (perDay && count > perDay)
    return `about ${Math.ceil(count / perDay)} days (daily cap ${num(perDay)})`;
  if (!paced) return null;
  const mins = Math.ceil(((count - 1) * 60) / perHour);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h
    ? `about ${h} h${m ? ` ${m} min` : ""}`
    : `about ${Math.max(m, 1)} min`;
}

/**
 * account: { id, fromEmail, hourlyLimit, dailyLimit, pacingEnabled }
 * count: emails this campaign will send (for the time estimate), optional
 * onSaved(updatedAccount)
 */
export default function SendingSpeedControl({
  account,
  count,
  countLabel = "this campaign takes",
  onSaved,
  compact = false,
}) {
  const [rate, setRate] = useState(account?.hourlyLimit ?? 60);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => setRate(account?.hourlyLimit ?? 60),
    [account?.id, account?.hourlyLimit],
  );
  if (!account) return null;

  const options = [...new Set([...SPEED_OPTIONS, account.hourlyLimit])].sort(
    (a, b) => a - b,
  );
  const changed = Number(rate) !== account.hourlyLimit;
  const paced = account.pacingEnabled !== false;
  const estimate = finishText(count, Number(rate), account.dailyLimit, paced);

  async function apply() {
    setBusy(true);
    try {
      const r = await api.put(`/smtp-accounts/${account.id}`, {
        hourlyLimit: Number(rate),
      });
      onSaved?.(r.data.data);
      toast(
        `${account.fromEmail} now sends ${paced ? spacingText(rate).toLowerCase() : `up to ${rate} per hour`}.`,
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-lg border border-ink-200 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor={`speed-${account.id}`}>
            <FiZap className="mr-1 inline" />
            Sending speed of {account.fromEmail}
          </label>
          <select
            id={`speed-${account.id}`}
            className="input w-56"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            disabled={busy}
          >
            {options.map((o) => (
              <option key={o} value={o} disabled={o > account.dailyLimit}>
                {o} per hour
                {paced ? ` · ${spacingText(o).replace("1 email ", "")}` : ""}
                {o > account.dailyLimit ? " (above daily cap)" : ""}
              </option>
            ))}
          </select>
        </div>
        {changed && (
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={apply}
              disabled={busy}
            >
              {busy ? "Saving…" : "Apply speed"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setRate(account.hourlyLimit)}
              disabled={busy}
            >
              Undo
            </button>
          </>
        )}
      </div>
      <p className="mt-2 text-sm text-ink-700">
        <b>
          {paced ? spacingText(rate) : `Up to ${rate} per hour, no spacing`}
        </b>
        {estimate && (
          <>
            {" "}
            · {countLabel} {estimate}
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-ink-500">
        This is the account’s speed, so other campaigns sending from{" "}
        {account.fromEmail} follow it too. It applies from the next email.{" "}
        <Link className="link" to="/settings?tab=sending">
          Days, hours and more
        </Link>
      </p>
    </div>
  );
}
