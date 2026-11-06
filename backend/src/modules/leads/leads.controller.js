import {
  leadService,
  leadFilters,
  convertLead,
  importLeads,
  getOptions,
  setOptions,
  buildEmailAudience,
} from "./leads.service.js";
import { listQuery as leadListQuery } from "./leads.validator.js";
import { createRecordController } from "../../services/records/recordController.js";
import { ok } from "../../utils/apiResponse.js";
import { requestContext } from "../../services/audit/auditService.js";
import { sendTable } from "../../services/files/tabularService.js";
import { fromMinor } from "../../utils/money.js";

/** "1200.00" → "1,200" ; "1200.50" → "1,200.5" (same look as the team's Excel). */
function priceText(minor, currency) {
  if (minor === null || minor === undefined) return "";
  const n = Number(fromMinor(minor, currency));
  const txt = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(n);
  return currency && currency !== "USD" ? `${currency} ${txt}` : txt;
}

// Exactly the columns (and order) of the team's lead tracker — import accepts the same file.
export const CLIENT_COLUMNS = [
  { key: "salesId", header: "Sales ID", value: (r) => r.ownerWorkspace?.code },
  { key: "fullName", header: "Client Name" },
  { key: "email", header: "Client Email" },
  {
    key: "ccEmails",
    header: "CC Mail",
    value: (r) => (r.ccEmails ?? []).join(", "),
  },
  { key: "subjectLine", header: "Subject Line" },
  {
    key: "phone",
    header: "Phone Number",
    value: (r) => r.phoneRaw ?? r.phoneE164,
  },
  { key: "responseStatus", header: "Response Status" },
  { key: "callStatus", header: "Call Status" },
  { key: "callNotes", header: "Call Notes" },
  { key: "previousPitch", header: "Previous Pitch" },
  { key: "followUpPitch", header: "Follow Up Pitch" },
  {
    key: "basicPrice",
    header: "Basic Package Price ($)",
    value: (r) => priceText(r.basicPriceMinor, r.priceCurrency),
  },
  {
    key: "premiumPrice",
    header: "Premium Package Price ($)",
    value: (r) => priceText(r.premiumPriceMinor, r.priceCurrency),
  },
  { key: "dataCount", header: "Data Count (Rows)" },
];

const DETAILED_COLUMNS = [
  ...CLIENT_COLUMNS,
  { key: "firstName", header: "First name" },
  { key: "lastName", header: "Last name" },
  { key: "companyName", header: "Company" },
  { key: "designation", header: "Designation" },
  { key: "website", header: "Website" },
  { key: "countryCode", header: "Country" },
  { key: "region", header: "Region" },
  { key: "city", header: "City" },
  { key: "timezone", header: "Timezone" },
  { key: "source", header: "Source" },
  { key: "status", header: "Lead status" },
  { key: "priority", header: "Priority" },
  { key: "score", header: "Score" },
  {
    key: "tags",
    header: "Tags",
    value: (r) => r.tags.map((t) => t.name).join("; "),
  },
  { key: "createdAt", header: "Created (UTC)" },
];

const base = createRecordController(leadService, {
  filterWhere: leadFilters,
  exportName: "leads",
  exportColumns: CLIENT_COLUMNS,
});
const ctx = requestContext;

export default {
  ...base,
  exportFile: async (req, res) => {
    const q = req.valid.query;
    const rows = await leadService.exportRows(req.scope, q, leadFilters(q));
    return sendTable(res, {
      format: q.format,
      filename: `leads-${new Date().toISOString().slice(0, 10)}`,
      columns: q.layout === "detailed" ? DETAILED_COLUMNS : CLIENT_COLUMNS,
      rows,
    });
  },
  template: async (req, res) =>
    sendTable(res, {
      format: req.valid.query.format,
      filename: "leads-import-template",
      columns: CLIENT_COLUMNS,
      rows: [],
    }),
  convert: async (req, res) =>
    ok(
      res,
      await convertLead(
        req.scope,
        req.valid.params.id,
        req.valid.body,
        ctx(req),
      ),
    ),
  importFile: async (req, res) =>
    ok(res, await importLeads(req.scope, req.file, req.valid.query, ctx(req))),
  options: async (req, res) => ok(res, await getOptions(req.accountId)),
  updateOptions: async (req, res) =>
    ok(res, await setOptions(req.accountId, req.valid.body, ctx(req))),
  emailAudience: async (req, res) => {
    const b = req.valid.body;
    const ids = b.all
      ? await base.matchingIds(req.scope, b.query ?? {}, leadListQuery)
      : b.ids;
    return ok(
      res,
      await buildEmailAudience(req.scope, ids, b.listName, ctx(req)),
    );
  },
};
