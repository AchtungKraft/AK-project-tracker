// Display helpers for Scope Estimate Baselines. Read-only formatting — no calculations feed billing.

export const money = (v) =>
  v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const moneyRange = (a, b) => {
  if (a == null && b == null) return null;
  if (a == null || b == null || a === b) return money(a ?? b);
  return `${money(a)}–${money(b)}`;
};

export const hoursRange = (a, b) => {
  if (!a && !b) return null;
  if (a == null || b == null || a === b) return `${a ?? b} hrs`;
  return `${a}–${b} hrs`;
};

export function hardCostText(b) {
  if (b.pricing_model === "legacy_estimate") {
    if (b.legacy_budget_tbd) return "TBD (legacy budget)";
    const r = moneyRange(b.legacy_budget_min, b.legacy_budget_max);
    return r ? `${r} (legacy budget, unclassified)` : "Not estimated (legacy)";
  }
  if (b.hard_cost_tbd) return "TBD";
  return moneyRange(b.hard_cost_min, b.hard_cost_max) || "Not estimated";
}

export function laborEstimateText(b) {
  const h = hoursRange(b.labor_hours_min, b.labor_hours_max);
  if (!h) return "Not estimated";
  return `${h} · ${moneyRange(b.labor_dollars_min, b.labor_dollars_max)}`;
}

// Aggregate from backend: { known_total, unknown_count }. Never shows a false $0 for missing data.
export function aggText(agg, linkCount) {
  if (!linkCount) return "None linked";
  if (!agg) return "Unknown";
  const { known_total, unknown_count } = agg;
  if (unknown_count && !known_total) return "Unknown";
  if (unknown_count) return `${money(known_total)} + ${unknown_count} unknown`;
  return money(known_total);
}

export function laborLoggedText(labor) {
  if (!labor) return "Unknown";
  if (!labor.entry_count) return "None logged";
  return `${labor.logged_hours} hrs (${labor.entry_count} ${labor.entry_count === 1 ? "entry" : "entries"})`;
}

export function laborChargeText(labor) {
  if (!labor) return "Unknown";
  if (labor.billing_type !== "BILLABLE") return `Not billable (${labor.billing_type.toLowerCase().replace(/_/g, " ")})`;
  if (labor.rate == null) return "Rate not set";
  return `${money(labor.charge_at_rate)} @ ${money(labor.rate)}/hr`;
}

export const REASON_LABELS = {
  already_converted: "Already converted",
  concurrent_conversion: "Converted by another user at the same time",
  not_in_this_review: "Not part of this scope review",
  not_approved: "Not approved",
  edited_since_approval: "Edited since approval — needs re-approval",
  no_approval_fingerprint: "No approval fingerprint recorded",
  not_currently_approved: "Not currently approved",
  linked_task_missing: "Linked task missing",
  task_in_other_project: "Linked task is in another project",
  task_already_has_baseline: "Task already has a baseline",
  multiple_linked_tasks: "Multiple linked tasks",
  confirmation_and_note_required: "Confirmation and note required",
  invalid_task_choice: "Invalid task choice",
  already_baselined: "Already baselined",
  concurrent_backfill: "Backfilled by another user at the same time",
  blocked: "Blocked",
  not_converted: "Not converted yet",
  already_converted_link_repaired: "Already converted — scope link repaired",
  image_not_from_source: "Image is not from the approved scope item",
  persistence_failed: "Save failed — nothing was created, safe to retry",
  scope_link_failed: "Task saved but scope link failed — retry to repair",
  already_has_images: "Task already has images",
  has_images: "Already has images",
  no_images: "No source images",
  task_missing: "Task missing",
  item_missing: "Scope item missing",
  other_project: "Different project",
};

export const reasonText = (r) => REASON_LABELS[r] || r;

export const STATUS_STYLES = {
  created: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  ready: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
  baselined: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  skipped: "bg-gray-800 text-gray-300 border-gray-600",
  needs_confirmation: "bg-amber-900/40 text-amber-300 border-amber-700/50",
  blocked: "bg-red-900/40 text-red-300 border-red-700/50",
  rejected: "bg-red-900/40 text-red-300 border-red-700/50",
  error: "bg-red-900/40 text-red-300 border-red-700/50",
};

export const STATUS_LABELS = {
  created: "Created",
  ready: "Ready",
  baselined: "Baselined",
  skipped: "Skipped",
  needs_confirmation: "Needs confirmation",
  blocked: "Blocked",
  rejected: "Rejected",
  error: "Error",
};

export const errorText = (e) => e?.response?.data?.error || e?.message || "Request failed";