import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * migrateInvoiceLinesToUnifiedModel — PHASE 10
 *
 * Safe migration: backfills source_entity + source_id on existing lines.
 * Does NOT auto-correct invoiced_qty. Produces report only.
 *
 * Modes:
 * - mode: "report" (default) — dry run, returns what would change
 * - mode: "apply_backfill" — backfill source_entity/source_id on lines
 * - mode: "reconcile_qty" — report invoiced_qty mismatches (no auto-fix)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { mode = 'report', project_id } = await req.json().catch(() => ({}));

    // Fetch all invoice lines
    const allLines = project_id
      ? await (async () => {
          const invoices = await base44.entities.ProjectInvoice.filter({ project_id });
          const ids = invoices.map(i => i.id);
          return ids.length > 0
            ? await base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: ids } })
            : [];
        })()
      : await base44.entities.ProjectInvoiceLine.list();

    const results = {
      total_lines: allLines.length,
      lines_needing_backfill: 0,
      lines_already_migrated: 0,
      lines_manual_no_source: 0,
      backfill_applied: 0,
      reconciliation: [],
    };

    // ── Step 1: Identify lines needing source_entity/source_id backfill ──
    const backfillCandidates = [];

    for (const line of allLines) {
      if (line.source_entity && line.source_id) {
        results.lines_already_migrated++;
        continue;
      }

      if (line.type === 'part' && line.part_commitment_id) {
        backfillCandidates.push({
          line_id: line.id,
          invoice_id: line.invoice_id,
          type: line.type,
          current_source_entity: line.source_entity,
          current_source_id: line.source_id,
          proposed_source_entity: 'PartCommitment',
          proposed_source_id: line.part_commitment_id,
        });
        results.lines_needing_backfill++;
      } else if (line.type === 'manual' || line.type === 'outside_cost') {
        results.lines_manual_no_source++;
      } else {
        // Unknown type or missing commitment ID — flag for review
        backfillCandidates.push({
          line_id: line.id,
          invoice_id: line.invoice_id,
          type: line.type,
          current_source_entity: line.source_entity,
          current_source_id: line.source_id,
          proposed_source_entity: null,
          proposed_source_id: null,
          needs_manual_review: true,
        });
      }
    }

    // ── Step 2: Apply backfill if mode = apply_backfill ──
    if (mode === 'apply_backfill') {
      for (const candidate of backfillCandidates) {
        if (!candidate.proposed_source_entity || !candidate.proposed_source_id) continue;

        await base44.asServiceRole.entities.ProjectInvoiceLine.update(candidate.line_id, {
          source_entity: candidate.proposed_source_entity,
          source_id: candidate.proposed_source_id,
        });
        results.backfill_applied++;
      }
    }

    // ── Step 3: Reconcile invoiced_qty (report only) ──
    if (mode === 'reconcile_qty' || mode === 'report') {
      const invoices = project_id
        ? await base44.entities.ProjectInvoice.filter({ project_id })
        : await base44.entities.ProjectInvoice.list();

      const sentPaidIds = new Set(
        invoices.filter(i => i.status === 'sent' || i.status === 'paid').map(i => i.id)
      );

      // Sum qty from sent/paid lines by commitment
      const expectedByCommitment = {};
      const amountByCommitment = {};

      for (const line of allLines) {
        if (!sentPaidIds.has(line.invoice_id)) continue;
        const sourceId = line.source_id || line.part_commitment_id;
        if (!sourceId || line.type !== 'part') continue;

        expectedByCommitment[sourceId] = (expectedByCommitment[sourceId] || 0) + (line.qty ?? 0);
        amountByCommitment[sourceId] = (amountByCommitment[sourceId] || 0) + (line.line_total ?? 0);
      }

      // Compare against actual
      const commitmentIds = Object.keys(expectedByCommitment);
      if (commitmentIds.length > 0) {
        const commitments = await base44.entities.PartCommitment.filter({ id: { $in: commitmentIds } });
        const commitmentMap = Object.fromEntries(commitments.map(c => [c.id, c]));

        for (const [id, expectedQty] of Object.entries(expectedByCommitment)) {
          const c = commitmentMap[id];
          if (!c) continue;

          const actualQty = c.invoiced_qty ?? 0;
          const actualAmount = c.invoiced_amount ?? 0;
          const expectedAmount = amountByCommitment[id] ?? 0;

          if (Math.abs(actualQty - expectedQty) > 0.01 || Math.abs(actualAmount - expectedAmount) > 0.01) {
            results.reconciliation.push({
              commitment_id: id,
              expected_invoiced_qty: expectedQty,
              actual_invoiced_qty: actualQty,
              qty_difference: actualQty - expectedQty,
              expected_invoiced_amount: expectedAmount,
              actual_invoiced_amount: actualAmount,
              amount_difference: actualAmount - expectedAmount,
            });
          }
        }
      }
    }

    return Response.json({
      success: true,
      mode,
      project_id: project_id || 'ALL',
      ...results,
      backfill_candidates: mode === 'report' ? backfillCandidates : undefined,
    });
  } catch (error) {
    console.error('migrateInvoiceLinesToUnifiedModel error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});