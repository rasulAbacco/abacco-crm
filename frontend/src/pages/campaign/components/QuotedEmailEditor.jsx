// Content step of a follow-up: the earlier email that goes below the new message, editable.
// Edits are a template: {{firstName}} etc. are filled for each person, and the
// From / Sent / To / Subject lines are added automatically.
import { useEffect, useState } from "react";
import { FiCornerUpLeft, FiRotateCcw } from "react-icons/fi";
import api, { errorMessage } from "../../../services/axiosInstance";
import EmailEditor from "../../../components/forms/EmailEditor";
import { Alert, Spinner } from "../../../components/common/ui";
import { num } from "../../../utils/format";

export default function QuotedEmailEditor({
  campaignId,
  salesId,
  ensureSaved,
  value,
  onChange,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      // Save first so the audience on the server matches what's on screen.
      const id = (await ensureSaved()) ?? campaignId;
      if (!id) {
        if (alive) setLoading(false);
        return;
      }
      try {
        const r = await api.get(`/campaigns/${id}/quote-source`, {
          headers: { "X-Sales-Id": salesId },
        });
        if (alive) setData(r.data.data);
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = (
    <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
      <FiCornerUpLeft /> Earlier email, quoted below your message
    </p>
  );
  if (loading)
    return (
      <div className="rounded-lg border border-ink-200 p-4">
        {title}
        <Spinner className="mt-2 h-5 w-5" />
      </div>
    );
  if (error) return <Alert tone="red">{error}</Alert>;
  if (!data?.source)
    return (
      <div className="rounded-lg border border-dashed border-ink-300 p-4 text-sm text-ink-700">
        {title}
        <p className="mt-1">
          {data?.withPitch
            ? `None of these people got an email from the CRM yet, so each one's Previous pitch from the lead tracker is quoted (${num(data.withPitch)}). Edit a pitch on the lead itself.`
            : "None of these people got an email from the CRM yet, so there is nothing to quote. Their emails go out as new messages."}
        </p>
      </div>
    );

  const isEdited = value !== null && value !== undefined;
  const current = isEdited ? value : data.html;
  return (
    <div className="rounded-lg border border-ink-200">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-200 bg-ink-50 px-4 py-3">
        <div>
          {title}
          <p className="mt-0.5 text-xs text-ink-600">
            “{data.source.subject || data.source.name}” from campaign{" "}
            <b>{data.source.name}</b> · used for {num(data.covers)} of{" "}
            {num(data.total)} people
          </p>
        </div>
        {isEdited && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              onChange(null, data.source.id);
              setResetKey((k) => k + 1);
            }}
          >
            <FiRotateCcw /> Restore original
          </button>
        )}
      </div>
      <div className="space-y-2 p-3">
        <p className="text-xs text-ink-500">
          Remove or change anything you like. {"{{firstName}}"} and other fields
          are filled for each person, and the From / Sent / To / Subject lines
          are added above it automatically.
          {data.otherEarlier > 0 &&
            ` ${num(data.otherEarlier)} people last got a different email; theirs is quoted unchanged.`}
          {data.withPitch > 0 &&
            ` ${num(data.withPitch)} get their lead's Previous pitch instead.`}
        </p>
        <EmailEditor
          key={resetKey}
          value={current}
          height={260}
          onChange={(html) =>
            onChange(html === data.original ? null : html, data.source.id)
          }
        />
      </div>
    </div>
  );
}
