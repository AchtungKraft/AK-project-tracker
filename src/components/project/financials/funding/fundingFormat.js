import { money } from "../finFormat";

// Money in the funding plan is integer cents; reconciliation values are dollars.
export const cents = (c) => (c == null ? "—" : money(c / 100));

// "1,234.5" → 123450. Returns null for empty, NaN for invalid / negative / >2 decimals.
export function parseMoneyToCents(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const [w, f = ""] = t.split(".");
  const v = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return Number.isSafeInteger(v) && v <= 100_000_000_00 ? v : NaN;
}
// "12.5" → 1250 basis points. 0–100, up to 2 decimals.
export function parsePercentToBps(s) {
  const t = String(s ?? "").replace(/[%\s]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const [w, f = ""] = t.split(".");
  const v = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return v <= 10000 ? v : NaN;
}
export const centsToInput = (c) => (c == null ? "" : (c / 100).toFixed(2));
export const bpsToInput = (b) => (b == null ? "" : (b / 100).toString());
export const pctOf = (budgetCents, bps) => Math.round((budgetCents * bps) / 10000);

// {known, unknown} accumulator → display
export const accMoney = (a) => (!a ? "—" : `${money(a.known)}${a.unknown ? ` +${a.unknown} unknown` : ""}`);
export const range = (r) => (!r || r.min == null ? "—" : r.min === r.max ? money(r.min) : `${money(r.min)}–${money(r.max)}`);

export const METHOD_LABEL = { FIXED_PARTS_FUNDING: "Fixed parts funding", PERCENT_OF_AGREED_CLIENT_BUDGET: "% of agreed client budget" };
export const STATE_LABEL = { converted: "Converted", unassigned_not_converted: "Unassigned · not converted", task_missing: "Task missing" };
export const REASON_LABEL = {
  no_task_link: "Not linked to any task",
  shared_across_tasks: "Linked to more than one task",
  linked_to_non_scope_task: "Linked to a task outside approved scope",
  task_shared_by_scope_items: "Task belongs to more than one scope item",
};
export const VARIANCE_LABEL = {
  legacy_unsplit: "Legacy estimate — no separate hard-cost allowance",
  allowance_tbd: "Allowance TBD — not comparable",
  allowance_not_estimated: "No allowance estimated — not comparable",
  no_linked_parts: "No linked parts yet",
};
export const VAR_TONE = { within: "text-emerald-400", over: "text-red-400", under: "text-sky-300", incomplete: "text-amber-300" };