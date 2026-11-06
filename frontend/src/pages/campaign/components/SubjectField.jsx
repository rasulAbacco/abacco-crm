// Subject step: either one subject for everyone, or each lead's own subject line
// (saved on the lead) with words added before / after it, e.g.
//   PMAWM 2026 Updated Email List  →  Follow up - PMAWM 2026 Updated Email List
// Stored as one template: "Follow up - {{subjectLine|<fallback>}}".
import { useEffect, useState } from "react";
import { TextInput } from "../../../components/forms/fields";

const OWN = /^([\s\S]*?)\{\{\s*subjectLine\s*(?:\|([^}]*))?\}\}([\s\S]*)$/;
const PRESETS = [
  "Follow up - ",
  "Payment follow up - ",
  "Re: ",
  "2nd follow up - ",
];
const SAMPLE = "PMAWM 2026 Updated Email List";

const clean = (s) => String(s ?? "").replace(/[{}|]/g, "");
export function parseSubject(subject) {
  const m = OWN.exec(subject ?? "");
  return m
    ? { own: true, before: m[1], after: m[3], fallback: m[2] ?? "" }
    : { own: false, before: "", after: "", fallback: "" };
}
export function buildSubject({ before, after, fallback }) {
  const b = before && !/\s$/.test(before) ? `${before} ` : before;
  const a = after && !/^\s/.test(after) ? ` ${after}` : after;
  return `${clean(b)}{{subjectLine${fallback.trim() ? `|${clean(fallback.trim())}` : ""}}}${clean(a)}`;
}
const tidy = (s) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s\-–—:|,]+|[\s\-–—:|,]+$/g, "")
    .trim();

export default function SubjectField({ value, onChange, preferOwn }) {
  const parsed = parseSubject(value);
  const [own, setOwn] = useState(parsed.own || (!value && preferOwn));
  const [parts, setParts] = useState(
    parsed.own ? parsed : { before: "Follow up - ", after: "", fallback: "" },
  );

  // Keep the stored template in step with the parts while in "own subject" mode.
  useEffect(() => {
    if (own) onChange(buildSubject(parts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, parts.before, parts.after, parts.fallback]);

  const setPart = (k, v) => setParts((p) => ({ ...p, [k]: v }));
  const example = (base) =>
    tidy(
      `${parts.before && !/\s$/.test(parts.before) ? `${parts.before} ` : parts.before}${base}${parts.after && !/^\s/.test(parts.after) ? ` ${parts.after}` : parts.after}`,
    );

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-800">
          Subject <span className="text-red-600">*</span>
        </span>
        <div
          className="inline-flex rounded-lg border border-ink-200 p-0.5 text-xs"
          role="group"
          aria-label="Subject type"
        >
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 ${own ? "bg-brand-600 text-white" : "text-ink-700"}`}
            onClick={() => setOwn(true)}
          >
            Each lead's own subject line
          </button>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 ${!own ? "bg-brand-600 text-white" : "text-ink-700"}`}
            onClick={() => {
              setOwn(false);
              onChange("");
            }}
          >
            Same subject for all
          </button>
        </div>
      </div>

      {own ? (
        <div className="space-y-3 rounded-lg border border-ink-200 bg-ink-50/50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <TextInput
              label="Add before"
              value={parts.before}
              onChange={(e) => setPart("before", e.target.value)}
              placeholder="e.g. Follow up -"
            />
            <span className="hidden whitespace-nowrap rounded-md border border-dashed border-ink-300 bg-white px-2 py-2 text-xs text-ink-600 sm:block">
              lead's subject line
            </span>
            <TextInput
              label="Add after (optional)"
              value={parts.after}
              onChange={(e) => setPart("after", e.target.value)}
              placeholder="e.g. – updated"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="py-1 text-ink-500">Quick:</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-full border border-ink-200 bg-white px-2 py-0.5 hover:border-brand-300"
                onClick={() => setPart("before", p)}
              >
                {p.trim()}
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-ink-200 bg-white px-2 py-0.5 hover:border-brand-300"
              onClick={() => setPart("before", "")}
            >
              Nothing (same subject)
            </button>
          </div>
          <TextInput
            label="If a lead has no subject line, use"
            value={parts.fallback}
            onChange={(e) => setPart("fallback", e.target.value)}
            placeholder="e.g. Your data list"
            hint="Recommended. Without it, those leads get only the added words."
          />
          <div className="rounded-md bg-white px-3 py-2 text-sm">
            <p className="text-xs text-ink-500">Example</p>
            <p>
              <span className="text-ink-500">Lead's subject:</span> {SAMPLE}
            </p>
            <p className="font-medium text-ink-900">
              <span className="font-normal text-ink-500">This email:</span>{" "}
              {example(SAMPLE) || "—"}
            </p>
          </div>
        </div>
      ) : (
        <TextInput
          aria-label="Subject"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. {{firstName|Hello}}, a quick idea for {{company}}"
          hint="Tip: {{subjectLine}} inserts the lead's own subject line."
        />
      )}
    </div>
  );
}
