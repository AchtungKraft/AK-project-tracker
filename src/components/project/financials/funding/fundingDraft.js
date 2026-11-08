import { centsToInput, bpsToInput, parseMoneyToCents, parsePercentToBps, pctOf } from "./fundingFormat.js";

export const newMilestone = () => ({ id: crypto.randomUUID(), name: "", method: "FIXED_PARTS_FUNDING", amount: "", percent: "", target_date: "", scope_category_id: "", scope_group_id: "", notes: "" });

export const draftFromPlan = (plan) => ({
  budget: centsToInput(plan?.agreed_client_budget_cents),
  confirmed: !!plan?.agreed_budget_confirmed,
  budgetNote: plan?.agreed_budget_note || "",
  notes: plan?.notes || "",
  changeNote: "",
  milestones: (plan?.milestones || []).map((m) => ({
    id: m.id, name: m.name, method: m.method, amount: centsToInput(m.amount_cents), percent: bpsToInput(m.percent_bps),
    target_date: m.target_date || "", scope_category_id: m.scope_category_id || "", scope_group_id: m.scope_group_id || "", notes: m.notes || "",
  })),
});

// Local preview only — the server recomputes and validates everything on save.
export function evaluateDraft(d) {
  const errors = [];
  const budget = parseMoneyToCents(d.budget);
  if (Number.isNaN(budget)) errors.push("Agreed client budget: enter a dollar amount with up to 2 decimals.");
  const okBudget = Number.isNaN(budget) ? null : budget;
  const rows = d.milestones.map((m, i) => {
    let calc = null, err = null;
    if (!m.name.trim()) err = "Name required";
    if (m.method === "FIXED_PARTS_FUNDING") {
      const c = parseMoneyToCents(m.amount);
      if (c == null || Number.isNaN(c)) err = err || "Enter an amount ($0 or more, up to 2 decimals)"; else calc = c;
    } else {
      const b = parsePercentToBps(m.percent);
      if (b == null || Number.isNaN(b)) err = err || "Enter 0–100% (up to 2 decimals)";
      else if (okBudget == null) err = err || "Needs an agreed client budget";
      else if (!d.confirmed) err = err || "Confirm the agreed client budget first";
      else calc = pctOf(okBudget, b);
    }
    if (err) errors.push(`Milestone ${i + 1}: ${err}`);
    return { ...m, calc, err };
  });
  const total = rows.reduce((s, r) => s + (r.calc || 0), 0);
  const fixedTotal = rows.filter((r) => r.method === "FIXED_PARTS_FUNDING").reduce((s, r) => s + (r.calc || 0), 0);
  const bpsTotal = rows.filter((r) => r.method !== "FIXED_PARTS_FUNDING").reduce((s, r) => s + (parsePercentToBps(r.percent) || 0), 0);
  const payload = {
    agreed_client_budget_cents: okBudget, confirm_agreed_budget: okBudget != null && d.confirmed,
    agreed_budget_note: d.budgetNote, notes: d.notes, change_note: d.changeNote,
    milestones: rows.map((r) => ({
      id: r.id, name: r.name.trim(), method: r.method,
      amount_cents: r.method === "FIXED_PARTS_FUNDING" ? parseMoneyToCents(r.amount) : null,
      percent_bps: r.method !== "FIXED_PARTS_FUNDING" ? parsePercentToBps(r.percent) : null,
      target_date: r.target_date || null, scope_category_id: r.scope_category_id || null, scope_group_id: r.scope_group_id || null, notes: r.notes,
    })),
  };
  return { errors, rows, total, fixedTotal, bpsTotal, budget: okBudget, payload };
}

// Comparisons against the approved scope budget (display only). Cost allowances are never used as a basis.
export function approvedWarnings(ev, approved) {
  const w = [];
  const hcMax = approved?.hard_cost?.max;
  if (hcMax != null && ev.fixedTotal > Math.round(hcMax * 100)) w.push("Fixed parts funding is higher than the approved hard-cost allowance maximum.");
  if (ev.bpsTotal > 10000) w.push(`Percentage milestones add up to ${(ev.bpsTotal / 100).toFixed(2)}%.`);
  if (ev.budget != null && ev.total > ev.budget) w.push("Total planned funding is higher than the agreed client budget.");
  const hc = approved?.hard_cost, lb = approved?.labor_dollars;
  if (ev.budget != null && hc?.min != null && lb?.min != null) {
    const lo = Math.round((hc.min + lb.min) * 100), hi = Math.round((hc.max + lb.max) * 100);
    if (ev.budget < lo || ev.budget > hi) w.push("Agreed client budget is outside the approved estimate range (hard cost + labor, known items only). This is a reference check, not a rule.");
  }
  return w;
}