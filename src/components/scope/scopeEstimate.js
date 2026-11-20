/**
 * Canonical estimate interpretation for Scope Item hard cost lines and labor hours.
 * One stored line = (low, high, tbd). Its state comes only from what was entered:
 *   tbd    – TBD checked                       → "TBD", no numbers
 *   exact  – low only                          → "$250" / "2 hrs"
 *   up_to  – high only                         → "Up to $500" / "Up to 5 hrs"
 *   range  – low and high                      → "$250–$500" / "2–5 hrs"
 *   none   – nothing entered, TBD unchecked    → description only, no value
 * 0 is a real number. Blank is never 0.
 * MUST MATCH base44/functions/clientScopeReview (estimate section) and publicClientRequestDetail.
 */

const toNum = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function classifyEstimate(low, high, tbd) {
  if (tbd) return { state: 'tbd', low: null, high: null };
  const lo = toNum(low), hi = toNum(high);
  if (lo != null && hi != null) return { state: 'range', low: lo, high: hi };
  if (lo != null) return { state: 'exact', low: lo, high: lo };
  if (hi != null) return { state: 'up_to', low: null, high: hi };
  return { state: 'none', low: null, high: null };
}

/** Same state, bounds multiplied (hours × rate). */
export const scaleEstimate = (e, f) => ({ state: e.state, low: e.low == null ? null : e.low * f, high: e.high == null ? null : e.high * f });

export const emptyAgg = () => ({ lo: 0, hi: 0, lower_open: false, numeric_count: 0, tbd_count: 0 });

export function addEstimate(agg, e) {
  if (e.state === 'tbd') agg.tbd_count++;
  else if (e.state !== 'none') {
    agg.numeric_count++;
    agg.hi += e.high;
    if (e.low == null) agg.lower_open = true; else agg.lo += e.low;
  }
  return agg;
}

export function mergeAgg(...aggs) {
  const r = emptyAgg();
  for (const a of aggs) {
    if (!a) continue;
    r.lo += a.lo; r.hi += a.hi; r.numeric_count += a.numeric_count; r.tbd_count += a.tbd_count;
    r.lower_open = r.lower_open || a.lower_open;
  }
  return r;
}

/** {min, max} for storage/API: min is null when any line is "Up to" (lower bound unspecified). */
export function aggBounds(agg) {
  if (!agg.numeric_count) return { min: null, max: null };
  return { min: agg.lower_open ? null : agg.lo, max: agg.hi };
}

const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const moneyCompact = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : money(v));
const hrs = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

function fmtBounds(min, max, kind, compact) {
  const f = kind === 'hours' ? hrs : compact ? moneyCompact : money;
  const unit = kind === 'hours' ? ' hrs' : '';
  if (min == null) return `Up to ${f(max)}${unit}`;
  if (min === max) return `${f(min)}${unit}`;
  return `${f(min)}–${f(max)}${unit}`;
}

/** One line. Returns null for description-only. */
export function formatEstimate(e, kind = 'money') {
  if (e.state === 'tbd') return 'TBD';
  if (e.state === 'none') return null;
  return fmtBounds(e.low, e.high, kind);
}

/** A subtotal. Known numbers stay visible; TBD components add a "+ TBD" marker. */
export function formatAgg(agg, kind = 'money', { compact = false } = {}) {
  if (!agg.numeric_count) return agg.tbd_count ? 'TBD' : null;
  const b = aggBounds(agg);
  const base = fmtBounds(b.min, b.max, kind, compact);
  return agg.tbd_count ? `${base} + TBD` : base;
}

/** Stored hard cost line → display value (null = description only). */
export const formatHardLine = (l) => formatEstimate(classifyEstimate(l.min, l.max, l.tbd));
/** Stored labor estimate → hours display (null = description only). */
export const formatLaborHours = (le) => formatEstimate(classifyEstimate(le.hours_min, le.hours_max, le.hours_tbd), 'hours');
/** Stored labor estimate → dollars at its rate snapshot (null = description only). */
export const formatLaborCost = (le) => formatEstimate(scaleEstimate(classifyEstimate(le.hours_min, le.hours_max, le.hours_tbd), le.rate_snapshot || 0));

/** Aggregate stored hard cost lines. */
export function hardLinesAgg(lines = []) {
  const agg = emptyAgg();
  for (const l of lines) addEstimate(agg, classifyEstimate(l.min, l.max, l.tbd));
  return agg;
}

/**
 * Labor hours + dollars. Internal records price hours × rate_snapshot. Client-safe data has
 * no rates: lines carry hours only (exclude_dollars) and one entry per item carries the
 * server-computed dollars (exclude_hours, labor_cost_min/max).
 */
export function laborAgg(estimates = []) {
  const hours = emptyAgg(), dollars = emptyAgg();
  for (const le of estimates) {
    const e = classifyEstimate(le.hours_min, le.hours_max, le.hours_tbd);
    if (!le.exclude_hours) addEstimate(hours, e);
    if (le.exclude_dollars) continue;
    if (le.labor_cost_min !== undefined || le.labor_cost_max !== undefined) addEstimate(dollars, classifyEstimate(le.labor_cost_min, le.labor_cost_max, false));
    else addEstimate(dollars, scaleEstimate(e, le.rate_snapshot || 0));
  }
  return { hours, dollars };
}