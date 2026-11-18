// Lead page → "Email conversation": every email the CRM sent to this lead, newest first,
// like a thread in Gmail. The newest is open; it already contains the earlier ones quoted
// below it. The lead's Previous pitch (sent outside the CRM) is shown at the bottom.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  FiChevronDown,
  FiChevronRight,
  FiCornerUpLeft,
  FiMail,
} from "react-icons/fi";
import { leadService } from "../services/leadService";
import { useApi } from "../../../hooks/useApi";
import {
  Badge,
  EmptyState,
  Spinner,
  Alert,
  StatusBadge,
} from "../../../components/common/ui";
import MailFrame from "../../../components/common/MailFrame";
import { formatDateTime } from "../../../utils/format";

function EmailItem({ e, open, onToggle }) {
  return (
    <li className="rounded-lg border border-ink-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-ink-50"
      >
        <span className="mt-0.5 text-ink-500">
          {open ? <FiChevronDown /> : <FiChevronRight />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink-900">
              {e.subject || "(no subject)"}
            </span>
            {e.isFollowUp && (
              <Badge tone="blue">
                <FiCornerUpLeft className="mr-1 inline" />
                Follow-up
              </Badge>
            )}
            {e.status !== "SENT" && <StatusBadge value={e.status} />}
            {e.opened && <Badge tone="emerald">Opened</Badge>}
            {e.clicked && <Badge tone="emerald">Clicked</Badge>}
          </span>
          <span className="block text-xs text-ink-500">
            {e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail} ·{" "}
            {formatDateTime(e.sentAt)}
            {e.cc?.length ? ` · Cc ${e.cc.join(", ")}` : ""}
          </span>
        </span>
        <Link
          to={`/campaigns/${e.campaignId}`}
          onClick={(ev) => ev.stopPropagation()}
          className="hidden shrink-0 text-xs text-ink-500 hover:underline sm:inline"
        >
          {e.campaignName}
        </Link>
      </button>
      {open && (
        <MailFrame
          html={e.html}
          title={e.subject || "Email"}
          height={380}
          className="rounded-b-lg border-t border-ink-200"
        />
      )}
    </li>
  );
}

export default function EmailConversation({ leadId }) {
  const { data, loading, error, reload } = useApi(
    () => leadService.conversation(leadId),
    [leadId],
  );
  const [open, setOpen] = useState(0);
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
  const emails = data?.emails ?? [];
  const pitch = data?.previousPitch;
  if (!emails.length && !pitch)
    return (
      <EmptyState
        icon={FiMail}
        title="No emails yet"
        description="Emails sent to this lead from campaigns appear here, newest first."
      />
    );
  return (
    <div className="space-y-3">
      {emails.length > 0 && (
        <p className="text-xs text-ink-500">
          {emails.length} email{emails.length === 1 ? "" : "s"} to {data.email}.
          A follow-up campaign replies under the newest one.
        </p>
      )}
      <ul className="space-y-2">
        {emails.map((e, i) => (
          <EmailItem
            key={`${e.campaignId}-${i}`}
            e={e}
            open={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
          />
        ))}
      </ul>
      {pitch && (
        <div className="rounded-lg border border-dashed border-ink-300 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Previous pitch (from the lead tracker
            {emails.length ? "" : ", quoted by the next follow-up"})
          </p>
          {pitch.subject && (
            <p className="mt-1 text-sm font-medium text-ink-900">
              {pitch.subject}
            </p>
          )}
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">
            {pitch.text}
          </p>
        </div>
      )}
    </div>
  );
}
