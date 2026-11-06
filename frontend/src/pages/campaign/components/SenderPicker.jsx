// "Send from" step: one sender per campaign. The Sales ID's own main email is the
// default; its alternate (e.g. Gmail) or another Sales ID's email can be chosen on purpose.
import { useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { Alert, Badge, StatusBadge } from "../../../components/common/ui";
import { humanize } from "../../../utils/format";

const ROLE_LABEL = {
  MAIN: ["Main email", "blue"],
  ALTERNATE: ["Alternate email", "amber"],
  ASSIGNED: ["Assigned to this Sales ID", "gray"],
};

function Option({ a, checked, onPick }) {
  const usable = a.isEnabled && a.health !== "AUTH_FAILED";
  const role = ROLE_LABEL[a.role];
  return (
    <label
      className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${checked ? "border-brand-600 bg-brand-50" : "border-ink-200"} ${!a.isEnabled ? "opacity-60" : ""}`}
    >
      <span className="flex items-center gap-3">
        <input
          type="radio"
          name="sender"
          disabled={!a.isEnabled}
          checked={checked}
          onChange={() => onPick(a.id)}
        />
        <span>
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {a.fromEmail}
            {role && <Badge tone={role[1]}>{role[0]}</Badge>}
            {a.role === "OTHER" && a.salesIds.length > 0 && (
              <Badge>{a.salesIds.join(", ")}</Badge>
            )}
          </span>
          <span className="block text-xs text-ink-500">
            {a.name} · {humanize(a.provider)}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2 text-xs text-ink-500">
        <StatusBadge value={a.isEnabled ? a.health : "INACTIVE"} /> up to{" "}
        {a.hourlyLimit}/h · {a.dailyLimit}/day
        {!usable && a.isEnabled && (
          <span className="text-red-700">sign-in failed — test it</span>
        )}
      </span>
    </label>
  );
}

export default function SenderPicker({
  smtp,
  value,
  onChange,
  includeCc,
  onIncludeCc,
  salesIdCode,
}) {
  const own = smtp.filter((a) => a.role !== "OTHER");
  const other = smtp.filter((a) => a.role === "OTHER");
  const chosen = smtp.find((a) => a.id === value);
  const [showOther, setShowOther] = useState(chosen?.role === "OTHER");
  const hasMain = own.some((a) => a.role === "MAIN");

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-ink-800">
          Send every email from
        </p>
        {own.length === 0 ? (
          <Alert>
            Sales ID {salesIdCode} has no email account yet. Set its{" "}
            <b>Main email</b> under{" "}
            <Link className="link" to="/sales-ids">
              Sales IDs → Edit
            </Link>
            , or add one under{" "}
            <Link className="link" to="/smtp-accounts">
              SMTP accounts
            </Link>
            .
          </Alert>
        ) : (
          <div className="space-y-2">
            {own.map((a) => (
              <Option
                key={a.id}
                a={a}
                checked={value === a.id}
                onPick={onChange}
              />
            ))}
          </div>
        )}
        {!hasMain && own.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Tip: set a Main email for {salesIdCode} (Sales IDs → Edit) and it is
            chosen automatically for new campaigns.
          </p>
        )}
      </div>

      {other.length > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-ink-700 hover:underline"
            onClick={() => setShowOther(!showOther)}
          >
            {showOther ? <FiChevronDown /> : <FiChevronRight />} Send from
            another Sales ID's email ({other.length})
          </button>
          {showOther && (
            <div className="mt-2 space-y-2">
              {other.map((a) => (
                <Option
                  key={a.id}
                  a={a}
                  checked={value === a.id}
                  onPick={onChange}
                />
              ))}
              <p className="text-xs text-ink-500">
                Only used because you pick it here. Its hourly and daily limits
                are shared with that Sales ID's own campaigns.
              </p>
            </div>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 rounded-lg border border-ink-200 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={includeCc}
          onChange={(e) => onIncludeCc(e.target.checked)}
        />
        <span>
          <span className="font-medium">Copy each lead's CC Mail</span>
          <span className="block text-xs text-ink-500">
            Adds the CC addresses saved on the lead/contact. Unsubscribed or
            suppressed CC addresses are left out, and each CC counts towards the
            sending limits.
          </span>
        </span>
      </label>

      <p className="text-xs text-ink-500">
        All emails of this campaign go out from this one address. If it has a
        problem the campaign waits or pauses — it never switches to another
        email by itself. Limits are never exceeded.
      </p>
    </div>
  );
}
