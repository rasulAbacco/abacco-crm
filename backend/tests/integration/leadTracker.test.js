// The team's Excel lead tracker: import, export in the same layout, editable
// statuses, select-all bulk updates and "email these leads".
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { prisma, resetDatabase, createAccount } from "../helpers/testApp.js";

const HEADERS = [
  "Sales ID",
  "Client Name",
  "Client Email",
  "Phone Number",
  "Response Status",
  "Call Status",
  "Call Notes",
  "Previous Pitch",
  "Follow Up Pitch",
  "Basic Package Price ($)",
  "Premium Package Price ($)",
  "Data Count (Rows)",
];
const ROWS = [
  [
    "REP-101",
    "Alpha BioTech",
    "procurement@alphabiotech.com",
    "+1 (555) 234-8901",
    "Not Responding",
    "Not Called",
    "",
    "US Oncologists & Cardiology Leads",
    "Exclusive 25% Holiday Discount on full dataset + verified direct dial extensions.",
    "1,200",
    "2,800",
    15400,
  ],
  [
    "REP-101",
    "Global Health Solutions",
    "marketing@globalhealthsol.com",
    "+1 (555) 876-5432",
    "Not Responding",
    "Left Voicemail",
    "Left message regarding holiday discount rate.",
    "UK Hospital Procurement Directors",
    "Special year-end bundle including full contact details and compliance guarantee.",
    "950",
    "2,200",
    8900,
  ],
  [
    "REP-102",
    "Apex Pharma Inc",
    "leads@apexpharma.com",
    "+1 (555) 901-2345",
    "Responded",
    "Call Connected",
    "Client requested proposal document.",
    "Global Clinical Research Contacts",
    "Complimentary sample records + free quarterly update subscription.",
    "2,100",
    "4,500",
    32000,
  ],
  [
    "REP-103",
    "MediTech Innovations",
    "contact@meditechininnovations.io",
    "+1 (555) 432-1098",
    "not responding",
    "Not Called",
    "",
    "European Medical Equipment Buyers",
    "Customized holiday deal with free data refresh for Q1 2027.",
    "800",
    "1,900",
    6500,
  ],
];

async function xlsx(rows, headers = HEADERS) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let ctx;
let rep101;
beforeAll(async () => {
  await resetDatabase();
  ctx = await createAccount("tracker");
  const r = await ctx
    .api()
    .post("/api/v1/sales-ids", { code: "rep-101", name: "Rep 101" });
  expect(r.status).toBe(201);
  rep101 = r.body.data;
  expect(rep101.code).toBe("REP-101");
  expect(
    (
      await ctx
        .api()
        .post("/api/v1/sales-ids", { code: "REP-101", name: "Another" })
    ).status,
  ).toBe(409);
});
afterAll(() => prisma.$disconnect());

describe("lead tracker import / export", () => {
  it("routes rows by the Sales ID column and reports unknown Sales IDs", async () => {
    const res = await ctx
      .api()
      .upload("/api/v1/leads/import", "Format_REP-101.xlsx", await xlsx(ROWS));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ createdCount: 2, errorCount: 2 });
    expect(res.body.data.errors.map((e) => e.message).join(" ")).toMatch(
      /Unknown Sales ID "REP-102"/,
    );

    const lead = await prisma.lead.findFirst({
      where: { emailNormalized: "procurement@alphabiotech.com" },
    });
    expect(lead).toMatchObject({
      ownerWorkspaceId: rep101.id,
      fullName: "Alpha BioTech",
      companyName: "Alpha BioTech",
      responseStatus: "Not Responding",
      callStatus: "Not Called",
      previousPitch: "US Oncologists & Cardiology Leads",
      priceCurrency: "USD",
      basicPriceMinor: 120000n,
      premiumPriceMinor: 280000n,
      dataCount: 15400,
      phoneRaw: "+1 (555) 234-8901",
    });
  });

  it("can create missing Sales IDs, skips duplicates and normalises status spelling", async () => {
    const res = await ctx
      .api()
      .upload(
        "/api/v1/leads/import?createMissingSalesIds=true",
        "again.xlsx",
        await xlsx(ROWS),
      );
    expect(res.body.data).toMatchObject({
      createdCount: 2,
      skippedCount: 2,
      errorCount: 0,
      createdSalesIds: ["REP-102", "REP-103"],
    });
    const medi = await prisma.lead.findFirst({
      where: { emailNormalized: "contact@meditechininnovations.io" },
      include: { ownerWorkspace: true },
    });
    expect(medi.ownerWorkspace.code).toBe("REP-103");
    expect(medi.responseStatus).toBe("Not Responding"); // "not responding" → list spelling
  });

  it("exports in exactly the same layout", async () => {
    const res = await ctx
      .api(rep101.id)
      .get("/api/v1/leads/export?format=xlsx")
      .buffer(true)
      .parse((r, cb) => {
        const d = [];
        r.on("data", (c) => d.push(c));
        r.on("end", () => cb(null, Buffer.concat(d)));
      });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    const EXPORT_HEADERS = [
      ...HEADERS.slice(0, 3),
      "CC Mail",
      "Subject Line",
      ...HEADERS.slice(3),
    ];
    expect(ws.getRow(1).values.slice(1)).toEqual(EXPORT_HEADERS);
    const rows = [];
    ws.eachRow((row, i) => i > 1 && rows.push(row.values.slice(1)));
    const alpha = rows.find((r) => r[1] === "Alpha BioTech");
    expect(alpha.slice(0, 3)).toEqual([
      "REP-101",
      "Alpha BioTech",
      "procurement@alphabiotech.com",
    ]);
    expect(alpha.slice(5, 8)).toEqual([
      "+1 (555) 234-8901",
      "Not Responding",
      "Not Called",
    ]);
    expect(alpha.slice(11)).toEqual(["1,200", "2,800", 15400]);
    const tpl = await ctx.api().get("/api/v1/leads/import-template?format=csv");
    expect(tpl.text.replace("﻿", "").trim()).toBe(
      EXPORT_HEADERS.map((h) => (/[",]/.test(h) ? `"${h}"` : h)).join(","),
    );
  });
});

describe("statuses, select-all and email audience", () => {
  it("has editable status lists", async () => {
    const opts = (await ctx.api().get("/api/v1/leads/options")).body.data;
    expect(opts.responseStatuses).toEqual(
      expect.arrayContaining([
        "Active",
        "Not Responding",
        "Leave Out",
        "Budget",
      ]),
    );
    const upd = await ctx
      .api()
      .put("/api/v1/leads/options", {
        responseStatuses: [...opts.responseStatuses, "Budget Issue"],
      });
    expect(upd.body.data.responseStatuses).toContain("Budget Issue");
  });

  it("filters by response status and updates every matching lead at once", async () => {
    const list = await ctx
      .api()
      .get("/api/v1/leads?responseStatus=Not%20Responding");
    expect(list.body.meta.total).toBe(3);
    const r = await ctx
      .api(rep101.id)
      .post("/api/v1/leads/bulk-update", {
        all: true,
        query: { responseStatus: "Not Responding" },
        patch: { callStatus: "Left Voicemail" },
      });
    expect(r.body.data.succeeded).toHaveLength(2);
    expect(
      await prisma.lead.count({
        where: { ownerWorkspaceId: rep101.id, callStatus: "Left Voicemail" },
      }),
    ).toBe(2);
  });

  it('turns all "Not Responding" leads of one Sales ID into an email list for a campaign', async () => {
    const mixed = await ctx
      .api()
      .post("/api/v1/leads/email-audience", {
        all: true,
        query: { responseStatus: "Not Responding" },
      });
    expect(mixed.status).toBe(409);
    expect(mixed.body.error.code).toBe("MULTIPLE_SALES_IDS");

    const res = await ctx
      .api(rep101.id)
      .post("/api/v1/leads/email-audience", {
        all: true,
        query: { responseStatus: "Not Responding" },
        listName: "Not Responding follow-up",
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      added: 2,
      contactsCreated: 2,
      listName: "Not Responding follow-up",
      workspace: { code: "REP-101" },
    });
    const members = await prisma.emailListContact.findMany({
      where: { listId: res.body.data.listId },
      include: { contact: true },
    });
    expect(members.map((m) => m.contact.email).sort()).toEqual([
      "marketing@globalhealthsol.com",
      "procurement@alphabiotech.com",
    ]);

    // Same name again → a new list, existing contacts reused.
    const again = await ctx
      .api(rep101.id)
      .post("/api/v1/leads/email-audience", {
        all: true,
        query: { responseStatus: "Not Responding" },
        listName: "Not Responding follow-up",
      });
    expect(again.body.data).toMatchObject({
      listName: "Not Responding follow-up (2)",
      contactsCreated: 0,
      added: 2,
    });
  });

  it("stores follow-up fields from the form", async () => {
    const r = await ctx
      .api(rep101.id)
      .post("/api/v1/leads", {
        fullName: "Beta Labs",
        email: "hi@beta.test",
        responseStatus: "Budget",
        callStatus: "Call Back Later",
        basicPrice: "1,500.50",
        premiumPrice: "3000",
        priceCurrency: "USD",
        dataCount: 1200,
        followUpPitch: "New year offer",
      });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      responseStatus: "Budget",
      basicPriceMinor: "150050",
      premiumPriceMinor: "300000",
      dataCount: 1200,
    });
  });

  it("keeps CC Mail from the form and from imports, and passes it to the email list contacts", async () => {
    const bad = await ctx
      .api(rep101.id)
      .post("/api/v1/leads", {
        fullName: "Gamma",
        email: "g@gamma.test",
        ccEmails: "boss@gamma.test, not-an-email",
      });
    expect(bad.status).toBe(422);
    const r = await ctx
      .api(rep101.id)
      .post("/api/v1/leads", {
        fullName: "Gamma",
        email: "g@gamma.test",
        ccEmails: "Boss@Gamma.test; team@gamma.test",
      });
    expect(r.status).toBe(201);
    expect(r.body.data.ccEmails).toEqual([
      "boss@gamma.test",
      "team@gamma.test",
    ]);

    const headers = [
      "Sales ID",
      "Client Name",
      "Client Email",
      "CC Mail",
      "Subject Line",
      "Response Status",
    ];
    const file = await xlsx(
      [
        [
          "REP-101",
          "Delta Corp",
          "buyer@delta.test",
          "ceo@delta.test, ops@delta.test",
          "PMAWM 2026 Updated Email List",
          "Not Responding",
        ],
        ["REP-101", "Eps Ltd", "x@eps.test", "wrong-cc", "", "Not Responding"],
      ],
      headers,
    );
    const imp = await ctx.api().upload("/api/v1/leads/import", "cc.xlsx", file);
    expect(imp.body.data).toMatchObject({ createdCount: 1, errorCount: 1 });
    expect(imp.body.data.errors[0].message).toMatch(/Invalid CC Mail/);
    const delta = await prisma.lead.findFirst({
      where: { emailNormalized: "buyer@delta.test" },
    });
    expect(delta.ccEmails).toEqual(["ceo@delta.test", "ops@delta.test"]);
    expect(delta.subjectLine).toBe("PMAWM 2026 Updated Email List");

    const aud = await ctx
      .api(rep101.id)
      .post("/api/v1/leads/email-audience", {
        ids: [delta.id],
        listName: "Delta",
      });
    const contact = await prisma.contact.findFirst({
      where: {
        ownerWorkspaceId: rep101.id,
        emailNormalized: "buyer@delta.test",
      },
    });
    expect(aud.status).toBe(200);
    expect(contact.ccEmails).toEqual(["ceo@delta.test", "ops@delta.test"]);
    expect(contact.subjectLine).toBe("PMAWM 2026 Updated Email List");
    const form = await ctx
      .api(rep101.id)
      .put(`/api/v1/leads/${delta.id}`, {
        subjectLine: "ASCO 2026 Attendee List",
      });
    expect(form.body.data.subjectLine).toBe("ASCO 2026 Attendee List");
  });
});
