// Review step: how the first email will look in the recipient's inbox, including the quoted
// earlier email for follow-ups, plus how many recipients have something to reply to.
import { FiCornerUpLeft } from "react-icons/fi";
import { Badge } from "../../../components/common/ui";
import { formatDateTime, num } from "../../../utils/format";
import MailFrame from "../../../components/common/MailFrame";

export default function EmailPreview({ sample, followUp }) {
  if (!sample) return null;
  const q = sample.quoted;
  return (
    <div className="space-y-3">
      {followUp && (
        <div className="rounded-lg border border-ink-200 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
            <FiCornerUpLeft /> Follow-up: what each email replies to
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="emerald">
              Last email from the CRM: {num(followUp.withEmail)}
            </Badge>
            <Badge tone="blue">
              Lead's Previous pitch: {num(followUp.withPitch)}
            </Badge>
            {followUp.none > 0 && (
              <Badge tone="amber">
                Nothing earlier, sent as a new email: {num(followUp.none)}
              </Badge>
            )}
          </div>
          {followUp.none > 0 && (
            <p className="mt-2 text-xs text-ink-500">
              People with nothing earlier get your message without a quote. If
              the subject is left as "RE:", they get the lead's subject line
              instead (or the campaign name).
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-ink-200">
        <div className="space-y-0.5 border-b border-ink-200 bg-ink-50 px-4 py-3 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">
            Preview of the first email
          </p>
          <p>
            <span className="inline-block w-16 text-ink-500">From</span>
            {sample.from}
          </p>
          <p>
            <span className="inline-block w-16 text-ink-500">To</span>
            {sample.to}
          </p>
          {sample.cc?.length > 0 && (
            <p>
              <span className="inline-block w-16 text-ink-500">Cc</span>
              {sample.cc.join(", ")}
            </p>
          )}
          <p className="font-medium text-ink-900">
            <span className="inline-block w-16 font-normal text-ink-500">
              Subject
            </span>
            {sample.subject}
          </p>
          {q && (
            <p className="pt-1 text-xs text-ink-600">
              Replies to{" "}
              {q.source === "EMAIL" ? (
                <>
                  “{q.subject}”
                  {q.campaignName ? (
                    <>
                      {" "}
                      from campaign <b>{q.campaignName}</b>
                    </>
                  ) : null}
                  , sent {formatDateTime(q.sentAt)}
                </>
              ) : (
                <>
                  the lead's Previous pitch
                  {q.subject ? <> (“{q.subject}”)</> : null}
                </>
              )}
            </p>
          )}
        </div>
        <MailFrame
          html={sample.html}
          title="Email preview"
          className="rounded-b-lg"
        />
      </div>
    </div>
  );
}
