import { money } from "./finFormat";

// Range formatting that never turns "unknown" into $0.
export const mRange = (r) => (!r || r.min == null ? "Not estimated" : r.min === r.max ? money(r.min) : `${money(r.min)} – ${money(r.max)}`);
export const hRange = (r) => (!r || r.min == null ? "Not estimated" : r.min === r.max ? `${r.min}h` : `${r.min}–${r.max}h`);

export const EXCLUDED_LABEL = {
  awaiting_reapproval: "Awaiting client reapproval",
  baseline_needs_review: "Baseline needs admin review",
  baseline_stale_reapproved: "Baseline predates latest approval",
  baseline_other_project: "Baseline belongs to another project",
  converted_without_baseline: "Converted but no baseline captured",
  no_approval_fingerprint: "No approval record",
  edited_since_approval: "Edited since approval",
};