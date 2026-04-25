import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * resolveProjectFinancialTotals — CANONICAL Financial Totals Resolver
 *
 * This is the SINGLE SOURCE OF TRUTH for all project financial totals.
 * Both getProjectSupplyView and getBillingAndProcurementStates MUST
 * delegate totals computation to this resolver.
 *
 * CANONICAL FORMULAS (commitment-snapshot based):
 *   planned_retail  = SUM(commitment.unit_retail_snapshot * commitment.required_total)
 *   planned_cost    = SUM(commitment.unit_cost_snapshot * commitment.required_total)
 *   invoiced_total  = SUM(commitment.invoiced_amount) + SUM(service.invoiced)
 *   credit_total    = SUM(CreditAllocation.amount_applied WHERE !is_reversed)
 *   remaining_total = planned_retail - invoiced_total - credit_total
 *
 * HARD RULES:
 *   - NO fallback to part.default_retail, part.default_cost, or qty_committed
 *   - If commitment has no snapshot, contribute $0 (flagged as integrity issue)
 *   - Services included unconditionally (not gated on completion status)
 *
 * Reconciliation output compares:
 *   - SUM(ProjectInvoiceLine.line_total) vs SUM(PartCommitment.invoiced_amount)
 *   - SUM(ProjectInvoice.total) vs SUM(commitment.invoiced_amount + service.invoiced)
 */

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

export async function resolveFinancials(base44, project_id) {
  // ── Parallel fetch all required entities ──
  const [
    commitments,
    serviceCommitments,
    invoices,
    creditAllocations,
  ] = await Promise.all([
    base44.entities.PartCommitment.filter({ project_id }),
    base44.entities.ServiceCommitment.filter({ project_id }).catch(() => []),
    base44.entities.ProjectInvoice.filter({ project_id }),
    base44.entities.CreditAllocation.filter({ project_id, is_reversed: false }).catch(() => []),
  ]);

  // Fetch invoice lines scoped to this project's invoices
  const invoiceIds = invoices.map(i => i.id);
  const invoiceLines = invoiceIds.length > 0
    ? await base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIds } })
    : [];

  // ── Active commitments (exclude cancelled) ──
  const activeCommitments = commitments.filter(c =>
    !c.cancelled_at &&
    c.is_archived !== true &&
    c.commitment_status !== 'cancelled'
  );

  // ══════════════════════════════════════════════
  // PARTS: Canonical commitment-snapshot totals
  // ══════════════════════════════════════════════
  let parts_planned_retail = 0;
  let parts_planned_cost = 0;
  let parts_invoiced_amount = 0;
  let parts_missing_snapshot_count = 0;

  for (const c of activeCommitments) {
    const unitRetail = c.unit_retail_snapshot ?? 0;
    const unitCost = c.unit_cost_snapshot ?? 0;
    const qty = c.required_total ?? 0;

    if (unitRetail === 0 && unitCost === 0) {
      parts_missing_snapshot_count++;
    }

    parts_planned_retail += unitRetail * qty;
    parts_planned_cost += unitCost * qty;
    parts_invoiced_amount += c.invoiced_amount ?? 0;
  }

  // ══════════════════════════════════════════════
  // SERVICES: Canonical totals (included unconditionally)
  // ══════════════════════════════════════════════
  let services_planned_retail = 0;
  let services_planned_cost = 0;
  let services_invoiced_amount = 0;

  for (const sc of serviceCommitments) {
    const billable = sc.total_billable ?? 0;
    const cost = sc.total_cost > 0
      ? sc.total_cost
      : ((sc.actual_cost ?? sc.estimated_cost ?? 0) * (sc.quantity || 1));

    services_planned_retail += billable;
    services_planned_cost += cost;

    const isBilled = sc.is_billed === true || sc.status === 'billed';
    if (isBilled) {
      services_invoiced_amount += billable;
    }
  }

  // ══════════════════════════════════════════════
  // CREDITS
  // ══════════════════════════════════════════════
  let credit_total = 0;
  for (const alloc of creditAllocations) {
    credit_total += alloc.amount_applied ?? 0;
  }

  // ══════════════════════════════════════════════
  // INVOICE-LEVEL TOTALS (for reconciliation)
  // ══════════════════════════════════════════════
  const activeInvoices = invoices.filter(inv =>
    inv.status !== 'cancelled' && inv.status !== 'void'
  );

  let invoice_entity_total = 0;
  let invoice_entity_paid = 0;
  let invoice_entity_balance_due = 0;

  for (const inv of activeInvoices) {
    invoice_entity_total += inv.total ?? inv.subtotal ?? 0;
    invoice_entity_paid += inv.paid_amount ?? 0;
    invoice_entity_balance_due += inv.balance_due ?? 0;
  }

  // Invoice line totals by commitment (for reconciliation)
  let invoice_lines_total = 0;
  const linesByCommitment = {};
  for (const line of invoiceLines) {
    const lineTotal = line.line_total ?? ((line.qty || 0) * (line.unit_price || 0));
    invoice_lines_total += lineTotal;
    if (line.part_commitment_id) {
      linesByCommitment[line.part_commitment_id] =
        (linesByCommitment[line.part_commitment_id] || 0) + lineTotal;
    }
  }

  // Include invoiced_amount from ALL commitments (including cancelled) for reconciliation
  // because invoice lines linked to cancelled commitments still represent real invoices
  let all_commitments_invoiced = 0;
  for (const c of commitments) {
    all_commitments_invoiced += c.invoiced_amount ?? 0;
  }

  // ══════════════════════════════════════════════
  // CANONICAL TOTALS
  // ══════════════════════════════════════════════
  const planned_retail = round2(parts_planned_retail + services_planned_retail);
  const planned_cost = round2(parts_planned_cost + services_planned_cost);
  const invoiced_total = round2(parts_invoiced_amount + services_invoiced_amount);
  const remaining_total = round2(Math.max(0, planned_retail - invoiced_total - credit_total));

  // ══════════════════════════════════════════════
  // RECONCILIATION (detect-only, no auto-fix)
  // ══════════════════════════════════════════════
  // Use all_commitments_invoiced (incl cancelled) for line-level reconciliation
  // because invoice lines may reference cancelled commitments
  const invoice_vs_commitment_delta = round2(invoice_entity_total - invoiced_total);
  const line_vs_commitment_delta = round2(invoice_lines_total - all_commitments_invoiced);

  const drift_detected =
    Math.abs(invoice_vs_commitment_delta) > 0.01 ||
    Math.abs(line_vs_commitment_delta) > 0.01;

  return {
    planned_retail,
    planned_cost,
    invoiced_total,
    credit_total: round2(credit_total),
    remaining_total,

    // Sub-totals for UI breakdowns
    parts_planned_retail: round2(parts_planned_retail),
    parts_planned_cost: round2(parts_planned_cost),
    services_planned_retail: round2(services_planned_retail),
    services_planned_cost: round2(services_planned_cost),

    // Invoice-entity-level totals (from ProjectInvoice, not commitments)
    invoice_entity_total: round2(invoice_entity_total),
    invoice_entity_paid: round2(invoice_entity_paid),
    invoice_entity_balance_due: round2(invoice_entity_balance_due),

    // Integrity
    parts_missing_snapshot_count,

    reconciliation: {
      drift_detected,
      invoice_vs_commitment_delta,
      line_vs_commitment_delta,
    },
  };
}

// ── HTTP Endpoint ──
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    const result = await resolveFinancials(base44, project_id);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('resolveProjectFinancialTotals error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});