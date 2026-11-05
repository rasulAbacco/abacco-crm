import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Spinner, Alert } from "../../../components/common/ui";
import { TextArea, TextInput } from "../../../components/forms/fields";
import { leadService } from "../services/leadService";
import { errorMessage } from "../../../services/axiosInstance";
import { toast } from "../../../store/uiStore";

/** Edit the Response Status and Call Status lists (one per line). */
export function ManageStatusesModal({ open, onClose, options, onSaved }) {
  const [resp, setResp] = useState("");
  const [call, setCall] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setResp(options.responseStatuses.join("\n"));
      setCall(options.callStatuses.join("\n"));
    }
  }, [open, options]);
  const lines = (t) =>
    t
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  const save = async () => {
    setBusy(true);
    try {
      const r = await leadService.saveOptions({
        responseStatuses: lines(resp),
        callStatuses: lines(call),
      });
      toast("Status lists saved");
      onSaved(r.data.data);
      onClose();
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
      title="Status lists"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={save}>
            {busy && <Spinner className="h-4 w-4" />}Save
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextArea
          label="Response statuses (one per line)"
          rows={10}
          value={resp}
          onChange={(e) => setResp(e.target.value)}
        />
        <TextArea
          label="Call statuses (one per line)"
          rows={10}
          value={call}
          onChange={(e) => setCall(e.target.value)}
        />
      </div>
      <p className="mt-3 text-xs text-ink-500">
        Removing a status from the list does not change leads that already have
        it. New values found in imports are added automatically.
      </p>
    </Modal>
  );
}

/** Turns the selected leads into an email list and opens the campaign builder with it. */
export function EmailLeadsModal({ open, onClose, target, count, defaultName }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setError("");
    }
  }, [open, defaultName]);
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await leadService.emailAudience({ ...target, listName: name });
      const d = r.data.data;
      toast(
        `List "${d.listName}" ready: ${d.added} people${d.skippedNoEmail ? ` (${d.skippedNoEmail} without email skipped)` : ""}`,
      );
      navigate(
        `/campaigns/new?listId=${d.listId}&salesId=${d.workspace.id}&name=${encodeURIComponent(d.listName)}`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Email ${count} lead${count === 1 ? "" : "s"}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || !name.trim()}
            onClick={go}
          >
            {busy && <Spinner className="h-4 w-4" />}Continue to campaign
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="red">{error}</Alert>}
        <p className="text-sm text-ink-700">
          The selected leads are put on a new email list (leads without an email
          are skipped), then the campaign builder opens with that list chosen.
          Write one pitch and send it to all of them.
        </p>
        <TextInput
          label="List name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-ink-500">
          A campaign is sent from one Sales ID. If the leads belong to several
          Sales IDs, select one Sales ID at the top first. Unsubscribed and
          suppressed people are always excluded.
        </p>
      </div>
    </Modal>
  );
}
