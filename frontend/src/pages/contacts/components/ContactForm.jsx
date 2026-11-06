import { useState } from "react";
import { Modal, Spinner } from "../../../components/common/ui";
import { FormGrid, Checkbox, Select } from "../../../components/forms/fields";
import OwnerSelect from "../../../components/forms/OwnerSelect";
import { RecordPicker } from "../../../components/common/RecordTools";
import { contactService } from "../services/contactService";
import { errorMessage, fieldErrors } from "../../../services/axiosInstance";
import { toast } from "../../../store/uiStore";

export default function ContactForm({
  open,
  onClose,
  contact,
  onSaved,
  defaults = {},
}) {
  const [v, setV] = useState({
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    ccEmails: (contact?.ccEmails ?? []).join(", "),
    phone: contact?.phoneRaw ?? "",
    companyId: contact?.companyId ?? defaults.companyId ?? null,
    designation: contact?.designation ?? "",
    countryCode: contact?.countryCode ?? "",
    region: contact?.region ?? "",
    city: contact?.city ?? "",
    timezone: contact?.timezoneSource === "EXPLICIT" ? contact.timezone : "",
    source: contact?.source ?? "",
    description: contact?.description ?? "",
    tags: contact?.tags?.map((t) => t.name) ?? [],
  });
  const [owner, setOwner] = useState("");
  const [consent, setConsent] = useState({ on: false, legalBasis: "consent" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, x === "" ? null : x]),
      );
      body.tags = v.tags;
      const r = contact
        ? await contactService.update(contact.id, body)
        : await contactService.create({
            ...body,
            ...(owner ? { ownerWorkspaceId: owner } : {}),
            ...(consent.on
              ? {
                  consent: { legalBasis: consent.legalBasis, source: "manual" },
                }
              : {}),
          });
      toast(contact ? "Contact saved" : "Contact created");
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
      title={contact ? "Edit contact" : "New contact"}
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
      {!contact && (
        <div className="mb-4 max-w-sm">
          <OwnerSelect value={owner} onChange={setOwner} />
        </div>
      )}
      <FormGrid
        values={v}
        errors={errors}
        onChange={setV}
        fields={[
          { name: "firstName", label: "First name" },
          { name: "lastName", label: "Last name" },
          { name: "email", label: "Email", type: "email" },
          {
            name: "phone",
            label: "Phone",
            hint: "Include the country code for international numbers",
          },
          {
            name: "ccEmails",
            label: "CC Mail",
            placeholder: "e.g. manager@client.com, team@client.com",
            hint: "Copied on campaign emails to this client. Separate several with commas (max 5).",
          },
          { name: "designation", label: "Designation" },
          {
            name: "companyId",
            render: (x, set) => (
              <RecordPicker
                label="Company"
                endpoint="/companies"
                value={x.companyId}
                onChange={(id) => set({ ...x, companyId: id })}
                display={(c) => c.name}
              />
            ),
          },
          { name: "countryCode", label: "Country", type: "country" },
          { name: "timezone", label: "Timezone", type: "timezone" },
          { name: "region", label: "State / region" },
          { name: "city", label: "City" },
          { name: "source", label: "Source" },
          { name: "tags", label: "Tags", type: "tags" },
          { name: "description", label: "Notes", type: "textarea", span: 2 },
        ]}
      />
      {!contact && (
        <div className="mt-4 rounded-lg border border-ink-200 p-3">
          <Checkbox
            label="This person agreed to receive marketing email"
            hint="Required before emailing people in the EU/UK, Canada, India and Australia (see Settings → Countries)."
            checked={consent.on}
            onChange={(e) => setConsent({ ...consent, on: e.target.checked })}
          />
          {consent.on && (
            <div className="mt-2 max-w-xs">
              <Select
                label="Legal basis"
                value={consent.legalBasis}
                placeholder={false}
                onChange={(e) =>
                  setConsent({ ...consent, legalBasis: e.target.value })
                }
                options={[
                  ["consent", "Consent"],
                  ["existing_customer", "Existing customer"],
                  ["legitimate_interest", "Legitimate interest"],
                ]}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
