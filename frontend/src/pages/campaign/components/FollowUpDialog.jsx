// Campaign page → "Follow up": makes a new draft that replies to this campaign, for everyone
// it reached or only those with no recorded open, then opens it at the Content step.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Spinner, Alert } from "../../../components/common/ui";
import { campaignService } from "../services/campaignService";
import { errorMessage } from "../../../services/axiosInstance";
import { toast } from "../../../store/uiStore";
import { num } from "../../../utils/format";

export default function FollowUpDialog({
  open,
  onClose,
  campaign,
  sent,
  opened,
}) {
  const navigate = useNavigate();
  const [audience, setAudience] = useState("SENT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notOpened = Math.max(sent - opened, 0);

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await campaignService.followUp(campaign.id, { audience });
      const d = r.data.data;
      toast(
        `Follow-up draft ready for ${num(d.people)} ${d.people === 1 ? "person" : "people"}`,
      );
      navigate(`/campaigns/${d.id}/edit?step=3`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const option = (value, title, count, hint) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${audience === value ? "border-brand-600 bg-brand-50" : "border-ink-200"}`}
    >
      <input
        type="radio"
        name="fu-audience"
        className="mt-1"
        checked={audience === value}
        onChange={() => setAudience(value)}
      />
      <span>
        <span className="text-sm font-medium text-ink-900">
          {title}{" "}
          <span className="font-normal text-ink-500">({num(count)})</span>
        </span>
        <span className="block text-xs text-ink-500">{hint}</span>
      </span>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Follow up on this campaign"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={go}>
            {busy && <Spinner className="h-4 w-4" />}Create follow-up
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="red">{error}</Alert>}
        <p className="text-sm text-ink-700">
          A new draft is made that replies to “{campaign.name}”: your message on
          top, this email quoted below it, subject “RE: …”, in the same
          conversation. Same sender and settings. You write the message next.
        </p>
        {option(
          "SENT",
          "Everyone who received it",
          sent,
          "Unsubscribed and suppressed people are still left out when it sends.",
        )}
        {option(
          "NOT_OPENED",
          "Only those who haven't opened it",
          notOpened,
          campaign.trackOpens
            ? "Opens are estimated: some mail apps block the tracking image, so a few people who read it may be included."
            : "Open tracking was off for this campaign, so this is everyone who received it.",
        )}
      </div>
    </Modal>
  );
}
