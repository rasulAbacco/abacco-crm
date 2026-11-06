import { useEffect, useState } from "react";
import { Modal, Spinner } from "../../../components/common/ui";
import { FormGrid } from "../../../components/forms/fields";
import { salesIdService } from "../services/salesIdService";
import { errorMessage, fieldErrors } from "../../../services/axiosInstance";
import { toast } from "../../../store/uiStore";
import { salesIdOptions } from "../../../services/commonService";
import { useSalesIdStore } from "../../../store/salesIdStore";
import api from "../../../services/axiosInstance";

export default function SalesIdForm({ open, onClose, item, onSaved }) {
  const keys = [
    "code",
    "name",
    "description",
    "color",
    "defaultCurrency",
    "defaultTimezone",
    "senderLegalName",
    "senderPostalAddress",
    "primarySmtpAccountId",
    "alternateSmtpAccountId",
  ];
  const [v, setV] = useState(
    Object.fromEntries(keys.map((k) => [k, item?.[k] ?? ""])),
  );
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const setOptions = useSalesIdStore((s) => s.setOptions);
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    // Every SMTP account of the CRM, not only the ones already assigned.
    api
      .get("/smtp-accounts", { headers: { "X-Sales-Id": "all" } })
      .then((r) => setAccounts(r.data.data))
      .catch(() => {});
  }, []);
  const senderOptions = accounts.map((a) => [
    a.id,
    `${a.fromEmail} (${a.name})`,
  ]);
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, x === "" ? null : x]),
      );
      if (body.code === null) delete body.code;
      if (!item)
        for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
      const r = item
        ? await salesIdService.update(item.id, body)
        : await salesIdService.create(body);
      toast(item ? "Sales ID saved" : `Sales ID ${r.data.data.code} created`);
      salesIdOptions().then((x) => setOptions(x.data.data));
      onSaved?.(r.data.data);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? `Edit ${item.code}` : "New Sales ID"}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || !v.name}
            onClick={save}
          >
            {busy && <Spinner className="h-4 w-4" />}Save
          </button>
        </>
      }
    >
      <FormGrid
        values={v}
        errors={errors}
        onChange={setV}
        fields={[
          {
            name: "code",
            label: "Sales ID code",
            placeholder: item
              ? undefined
              : "Automatic (e.g. SID-004) or type REP-101",
            hint: 'Letters, digits, - or _. Used in the "Sales ID" column of lead imports.',
          },
          {
            name: "name",
            label: "Name",
            required: true,
            placeholder: "e.g. USA Outbound",
          },
          { name: "color", label: "Colour", type: "color" },
          {
            name: "description",
            label: "Description",
            type: "textarea",
            span: 2,
            rows: 2,
          },
          {
            name: "defaultCurrency",
            label: "Default currency",
            type: "currency",
            placeholder: "Account default",
          },
          {
            name: "defaultTimezone",
            label: "Default timezone",
            type: "timezone",
            placeholder: "Account default",
          },
          {
            name: "primarySmtpAccountId",
            label: "Main email (sends this Sales ID's campaigns)",
            type: "select",
            options: senderOptions,
            placeholder: accounts.length
              ? "Choose…"
              : "Add an SMTP account first",
            hint: "e.g. robert.jackson@crmconnectleads.com",
          },
          {
            name: "alternateSmtpAccountId",
            label: "Alternate email",
            type: "select",
            options: senderOptions.filter(
              ([id]) => id !== v.primarySmtpAccountId,
            ),
            placeholder: "None",
            hint: "e.g. a Gmail address. Used only when you choose it in a campaign.",
          },
          {
            name: "senderLegalName",
            label: "Sender legal name (email footer)",
            hint: "Required before sending campaigns",
            span: 2,
          },
          {
            name: "senderPostalAddress",
            label: "Sender postal address (email footer)",
            type: "textarea",
            rows: 2,
            span: 2,
            hint: "CAN-SPAM, GDPR/PECR, CASL and others require a physical address",
          },
        ]}
      />
    </Modal>
  );
}
