// Content step: "Send as a follow-up". Each email then replies to the last email that person
// got from this Sales ID, Outlook style: the new message on top, the earlier email quoted
// below (From / Sent / To / Subject), in the same conversation in Gmail and Outlook.
// If the CRM never emailed someone, the lead's "Previous pitch" is quoted instead.
import { FiCornerUpLeft } from "react-icons/fi";

export default function FollowUpOptions({
  enabled,
  onToggle,
  replySubject,
  onReplySubject,
  onInsertPitch,
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${enabled ? "border-brand-300 bg-brand-50/50" : "border-ink-200"}`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
            <FiCornerUpLeft /> Send as a follow-up (reply to the previous email)
          </span>
          <span className="mt-0.5 block text-xs text-ink-600">
            Your message goes on top and the last email each person got from
            this Sales ID is quoted below it, like Reply in Outlook or Gmail. It
            arrives in the same conversation. If the CRM never emailed them, the
            lead's Previous pitch is quoted instead.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-3 border-t border-brand-200 pt-3 pl-7">
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink-700">
              Subject
            </legend>
            <div className="space-y-1 text-sm text-ink-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="followup-subject"
                  checked={replySubject}
                  onChange={() => onReplySubject(true)}
                />
                <span>
                  <b>RE:</b> + the earlier email's subject{" "}
                  <span className="text-ink-500">
                    (recommended, keeps the thread)
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="followup-subject"
                  checked={!replySubject}
                  onChange={() => onReplySubject(false)}
                />
                <span>My own subject</span>
              </label>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
            <span>Message:</span>
            <button
              type="button"
              className="rounded-full border border-ink-200 bg-white px-2.5 py-0.5 hover:border-brand-300"
              onClick={onInsertPitch}
            >
              Insert each lead's Follow-up pitch
            </button>
            <span className="text-ink-500">
              adds {"{{followUpPitch}}"}, filled from the lead tracker
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
