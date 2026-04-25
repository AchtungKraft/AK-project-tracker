import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * analyzeFinancialDrift — Drift Analyzer & Repair Tool
 *
 * Phases:
 *   1. Analyze: For each project, compute per-commitment delta between
 *      ProjectInvoiceLine.line_total SUM and PartCommitment.invoiced_amount
 *   2. Classify: under-reported vs over-reported
 *   3. Repair (apply mode): Update PartCommitment.invoiced_amount = invoice_line_sum
 *      NEVER touches ProjectInvoice or ProjectInvoiceLine
 *   4. Validate: Re-run resolver to confirm zero drift
 *
 * Modes:
 *   - preview (default): Returns drift analysis without changes
 *   - apply: Executes repair and returns before/after log
 *
 * Params:
 *   { project_id?: string, mode?: 'preview' | 'apply' }
 *   If project_id omitted, scans all projects with drift
 */

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

async function analyzeProjectDrift(base44, project_id) {
  // Fetch commitments and invoices for this project
  const [commitments, invoices] = await Promise.all([
    base44.entities.PartCommitment.filter({ project_id }),
    base44.entities.ProjectInvoice.filter({ project_id }),
  ]);

  // Only non-cancelled invoices
  const activeInvoiceIds = invoices
    .filter(inv => inv.status !== 'cancelled' && inv.status !== 'void')
    .map(inv => inv.id);

  // Fetch invoice lines for active invoices
  const invoiceLines = activeInvoiceIds.length > 0
    ? await base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: activeInvoiceIds } })
    : [];

  // Active commitments (exclude cancelled)
  const activeCommitments = commitments.filter(c =>
    !c.cancelled_at &&
    c.is_archived !== true &&
    c.commitment_status !== 'cancelled'
  );

  // Build invoice line totals by commitment_id
  const lineSumByCommitment = {};
  let total_lines_amount = 0;
  let unlinked_lines_amount = 0;
  const unlinked_lines = [];

  for (const line of invoiceLines) {
    const lineTotal = round2(line.line_total ?? ((line.qty || 0) * (line.unit_price || 0)));
    total_lines_amount += lineTotal;

    if (line.part_commitment_id) {
      lineSumByCommitment[line.part_commitment_id] =
        round2((lineSumByCommitment[line.part_commitment_id] || 0) + lineTotal);
    } else {
      // Lines not linked to a commitment — these cause header-level drift
      unlinked_lines_amount += lineTotal;
      unlinked_lines.push({
        line_id: line.id,
        invoice_id: line.invoice_id,
        type: line.type,
        description: line.description,
        line_total: lineTotal,
      });
    }
  }

  // Compute per-commitment drift (compare each commitment's invoiced_amount to its linked lines)
  const drifts = [];
  let commitment_delta = 0;
  // Also track lines linked to commitments that aren't in the active set (orphan links)
  const activeCommitmentIds = new Set(activeCommitments.map(c => c.id));
  let orphan_linked_amount = 0;
  const orphan_linked_lines = [];

  for (const [cid, lineSum] of Object.entries(lineSumByCommitment)) {
    if (!activeCommitmentIds.has(cid)) {
      orphan_linked_amount += lineSum;
      orphan_linked_lines.push({ commitment_id: cid, line_sum: lineSum });
    }
  }

  for (const c of activeCommitments) {
    const commitment_invoiced = round2(c.invoiced_amount ?? 0);
    const invoice_line_sum = round2(lineSumByCommitment[c.id] || 0);
    const delta = round2(invoice_line_sum - commitment_invoiced);

    if (Math.abs(delta) > 0.01) {
      drifts.push({
        commitment_id: c.id,
        part_id: c.part_id,
        required_total: c.required_total ?? 0,
        commitment_invoiced,
        invoice_line_sum,
        delta,
        drift_type: delta > 0 ? 'UNDER_REPORTED' : 'OVER_REPORTED',
        invoiced_qty: c.invoiced_qty ?? 0,
      });
      commitment_delta += delta;
    }
  }

  // Total commitment invoiced amounts — ALL commitments including cancelled
  // because invoice lines may reference cancelled commitments
  const total_commitment_invoiced = round2(
    commitments.reduce((sum, c) => sum + (c.invoiced_amount ?? 0), 0)
  );

  // Header-level drift: total lines vs ALL commitment invoiced
  const header_delta = round2(total_lines_amount - total_commitment_invoiced);

  return {
    project_id,
    total_commitments: activeCommitments.length,
    drifts,
    commitment_delta: round2(commitment_delta),
    drift_count: drifts.length,
    // Header-level analysis
    total_lines_amount: round2(total_lines_amount),
    total_commitment_invoiced,
    header_delta,
    unlinked_lines_amount: round2(unlinked_lines_amount),
    unlinked_lines,
    orphan_linked_amount: round2(orphan_linked_amount),
    orphan_linked_lines,
  };
}

async function applyDriftRepair(base44, projectAnalysis) {
  const changes = [];

  // Fix 1: Active commitment drift — update invoiced_amount to match line sums
  for (const drift of projectAnalysis.drifts) {
    await base44.asServiceRole.entities.PartCommitment.update(drift.commitment_id, {
      invoiced_amount: drift.invoice_line_sum,
    });

    changes.push({
      repair_type: 'commitment_sync',
      project_id: projectAnalysis.project_id,
      commitment_id: drift.commitment_id,
      part_id: drift.part_id,
      before: drift.commitment_invoiced,
      after: drift.invoice_line_sum,
      delta: drift.delta,
      drift_type: drift.drift_type,
    });
  }

  // Fix 2: Orphan-linked lines — update cancelled/inactive commitment invoiced_amount
  // so the resolver reconciliation sees them. Invoice lines are source of truth.
  for (const orphan of projectAnalysis.orphan_linked_lines) {
    await base44.asServiceRole.entities.PartCommitment.update(orphan.commitment_id, {
      invoiced_amount: orphan.line_sum,
    });

    changes.push({
      repair_type: 'orphan_commitment_sync',
      project_id: projectAnalysis.project_id,
      commitment_id: orphan.commitment_id,
      before: 0,
      after: orphan.line_sum,
      delta: orphan.line_sum,
      drift_type: 'ORPHAN_LINKED',
    });
  }

  return changes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { project_id, mode = 'preview' } = await req.json().catch(() => ({}));

    // If no project_id, scan all projects
    let projectIds = [];
    if (project_id) {
      projectIds = [project_id];
    } else {
      // Get distinct project_ids from commitments that have invoiced_amount > 0
      // or from projects that have invoices
      const allInvoices = await base44.asServiceRole.entities.ProjectInvoice.filter({
        status: { $ne: 'cancelled' },
      });
      const uniqueProjectIds = [...new Set(allInvoices.map(i => i.project_id).filter(Boolean))];
      projectIds = uniqueProjectIds;
    }

    // Analyze each project
    const results = [];
    let global_delta = 0;
    let global_drift_count = 0;

    for (const pid of projectIds) {
      const analysis = await analyzeProjectDrift(base44, pid);
      if (analysis.drifts.length > 0 || Math.abs(analysis.header_delta) > 0.01) {
        results.push(analysis);
        global_delta += analysis.header_delta;
        global_drift_count += analysis.drift_count;
      }
    }

    // Apply mode — execute repairs
    if (mode === 'apply' && results.length > 0) {
      const allChanges = [];
      for (const projectAnalysis of results) {
        const changes = await applyDriftRepair(base44, projectAnalysis);
        allChanges.push(...changes);
      }

      // Post-fix validation: re-check each repaired project
      const validationResults = [];
      for (const projectAnalysis of results) {
        const recheck = await analyzeProjectDrift(base44, projectAnalysis.project_id);
        validationResults.push({
          project_id: projectAnalysis.project_id,
          remaining_commitment_drift: recheck.commitment_delta,
          remaining_header_drift: recheck.header_delta,
          remaining_count: recheck.drift_count,
          success: recheck.drift_count === 0 && Math.abs(recheck.header_delta) < 0.02,
        });
      }

      return Response.json({
        success: true,
        mode: 'apply',
        projects_repaired: results.length,
        commitments_fixed: allChanges.length,
        total_delta_corrected: round2(global_delta),
        changes: allChanges,
        validation: validationResults,
        all_clear: validationResults.every(v => v.success),
        note: results.some(r => r.unlinked_lines.length > 0)
          ? 'Some drift is from invoice lines not linked to any commitment (manual/outside_cost lines). These require manual review.'
          : undefined,
      });
    }

    // Preview mode (default)
    return Response.json({
      success: true,
      mode: 'preview',
      projects_with_drift: results.length,
      total_drift_commitments: global_drift_count,
      total_delta: round2(global_delta),
      projects: results,
    });

  } catch (error) {
    console.error('analyzeFinancialDrift error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});