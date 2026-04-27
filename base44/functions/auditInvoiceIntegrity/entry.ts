import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * auditInvoiceIntegrity — PHASE 11 Diagnostics
 *
 * Checks:
 * - Invoice lines missing source_id/source_entity
 * - Service invoice lines missing ServiceCommitment
 * - Part invoice lines exceeding effective_required
 * - invoiced_qty mismatch vs sent invoice lines
 * - Credits deducted more than once
 * - Draft invoices that mutated source records (legacy detection)
 * - Services marked billed without invoice_id
 * - Invoice lines with $0 where source billable > 0
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json().catch(() => ({}));

    const blocking = [];
    const warns = [];
    const repairs = [];

    // Fetch data
    const invoiceFilter = project_id ? { project_id } : {};
    const invoices = Object.keys(invoiceFilter).length > 0
      ? await base44.entities.ProjectInvoice.filter(invoiceFilter)
      : await base44.entities.ProjectInvoice.list();

    const invoiceIds = invoices.map(i => i.id);
    const allLines = invoiceIds.length > 0
      ? await base44.entities.ProjectInvoiceLine.filter({ invoice_id: { $in: invoiceIds } })
      : [];

    const commitmentFilter = project_id ? { project_id } : {};
    const commitments = Object.keys(commitmentFilter).length > 0
      ? await base44.entities.PartCommitment.filter(commitmentFilter)
      : await base44.entities.PartCommitment.list();

    const serviceFilter = project_id ? { project_id } : {};
    const serviceCommitments = Object.keys(serviceFilter).length > 0
      ? await base44.entities.ServiceCommitment.filter(serviceFilter).catch(() => [])
      : await base44.entities.ServiceCommitment.list().catch(() => []);

    const credits = project_id
      ? await base44.entities.ProjectCreditLedger.filter({ project_id })
      : await base44.entities.ProjectCreditLedger.list();

    const commitmentMap = Object.fromEntries(commitments.map(c => [c.id, c]));
    const serviceMap = Object.fromEntries(serviceCommitments.map(s => [s.id, s]));
    const invoiceMap = Object.fromEntries(invoices.map(i => [i.id, i]));

    // ── Check 1: Lines missing source_id/source_entity ──
    for (const line of allLines) {
      if (!line.source_entity || !line.source_id) {
        if (line.type === 'part' && line.part_commitment_id) {
          repairs.push({
            type: 'BACKFILL_SOURCE',
            line_id: line.id,
            invoice_id: line.invoice_id,
            fix: { source_entity: 'PartCommitment', source_id: line.part_commitment_id },
          });
        } else if (line.type !== 'manual' && line.type !== 'outside_cost') {
          warns.push({
            type: 'MISSING_SOURCE',
            line_id: line.id,
            invoice_id: line.invoice_id,
            message: `Line type=${line.type} missing source_entity/source_id`,
          });
        }
      }
    }

    // ── Check 2: invoiced_qty mismatch ──
    // Build expected invoiced_qty from SENT/PAID invoice lines
    const sentPaidInvoiceIds = new Set(
      invoices.filter(i => i.status === 'sent' || i.status === 'paid').map(i => i.id)
    );
    const qtyByCommitment = {};
    const amountByCommitment = {};

    for (const line of allLines) {
      if (!sentPaidInvoiceIds.has(line.invoice_id)) continue;
      const sourceId = line.source_id || line.part_commitment_id;
      if (!sourceId || line.type !== 'part') continue;

      qtyByCommitment[sourceId] = (qtyByCommitment[sourceId] || 0) + (line.qty ?? 0);
      amountByCommitment[sourceId] = (amountByCommitment[sourceId] || 0) + (line.line_total ?? 0);
    }

    for (const [commitmentId, expectedQty] of Object.entries(qtyByCommitment)) {
      const c = commitmentMap[commitmentId];
      if (!c) continue;
      const actualQty = c.invoiced_qty ?? 0;
      const diff = actualQty - expectedQty;

      if (Math.abs(diff) > 0.01) {
        blocking.push({
          type: 'INVOICED_QTY_MISMATCH',
          commitment_id: commitmentId,
          expected_invoiced_qty: expectedQty,
          actual_invoiced_qty: actualQty,
          difference: diff,
          message: diff > 0
            ? `Over-counted by ${diff} (likely double-write from legacy draft creation)`
            : `Under-counted by ${Math.abs(diff)}`,
        });

        repairs.push({
          type: 'FIX_INVOICED_QTY',
          commitment_id: commitmentId,
          current: actualQty,
          correct: expectedQty,
          also_fix_amount: { current: c.invoiced_amount ?? 0, correct: amountByCommitment[commitmentId] ?? 0 },
        });
      }
    }

    // ── Check 3: Part lines exceeding effective_required ──
    for (const line of allLines) {
      if (line.type !== 'part') continue;
      const sourceId = line.source_id || line.part_commitment_id;
      if (!sourceId) continue;
      const c = commitmentMap[sourceId];
      if (!c) continue;

      const effectiveRequired = Math.max(0, (c.required_total ?? 0) - (c.qty_removed ?? 0));
      if ((line.qty ?? 0) > effectiveRequired) {
        warns.push({
          type: 'QTY_EXCEEDS_EFFECTIVE',
          line_id: line.id,
          invoice_id: line.invoice_id,
          line_qty: line.qty,
          effective_required: effectiveRequired,
        });
      }
    }

    // ── Check 4: Services marked billed without invoice_id ──
    for (const sc of serviceCommitments) {
      if (sc.is_billed === true && !sc.invoice_id) {
        warns.push({
          type: 'SERVICE_BILLED_NO_INVOICE',
          service_commitment_id: sc.id,
          description: sc.description,
          message: 'Service is_billed=true but has no invoice_id',
        });
      }
    }

    // ── Check 5: Credit double-deduction ──
    // If a sent invoice has credit_applied > 0, and the same invoice also has draft-era credit_idempotency_key
    // that matches a ledger deduction, credit was deducted twice
    for (const inv of invoices) {
      if (inv.status === 'cancelled') continue;
      const proposedCredit = inv.credit_proposed ?? inv.credit_preview ?? 0;
      const appliedCredit = inv.credit_applied ?? 0;
      if (proposedCredit > 0 && appliedCredit > 0 && inv.status === 'sent') {
        // Check if both proposed AND applied resulted in ledger deductions
        const ledgerDeductions = credits.filter(
          c => c.applied_to_invoice_id === inv.id || c.credit_idempotency_key?.includes(inv.id)
        );
        const totalDeducted = credits
          .filter(c => c.applied_to_invoice_id === inv.id)
          .reduce((s, c) => s + ((c.credit_amount ?? 0) - (c.remaining_amount ?? 0)), 0);

        if (totalDeducted > appliedCredit * 1.01) {
          blocking.push({
            type: 'CREDIT_DOUBLE_DEDUCTION',
            invoice_id: inv.id,
            credit_applied: appliedCredit,
            total_deducted_from_ledger: totalDeducted,
            message: 'Credit was likely deducted at both draft creation AND sent time',
          });
        }
      }
    }

    // ── Check 6: $0 lines where source has billable > 0 ──
    for (const line of allLines) {
      if ((line.line_total ?? 0) > 0) continue;
      const sourceId = line.source_id || line.part_commitment_id;
      if (!sourceId) continue;

      if (line.type === 'part') {
        const c = commitmentMap[sourceId];
        if (c && (c.unit_retail_snapshot ?? 0) > 0) {
          warns.push({
            type: 'ZERO_LINE_WITH_RETAIL',
            line_id: line.id,
            source_id: sourceId,
            unit_retail_snapshot: c.unit_retail_snapshot,
            message: 'Invoice line is $0 but source has non-zero retail',
          });
        }
      }
    }

    // ── Check 7: Draft invoices with mutated sources (legacy detection) ──
    const draftInvoiceIds = new Set(invoices.filter(i => i.status === 'draft').map(i => i.id));
    for (const line of allLines) {
      if (!draftInvoiceIds.has(line.invoice_id)) continue;
      if (line.type !== 'part') continue;
      const sourceId = line.source_id || line.part_commitment_id;
      if (!sourceId) continue;
      const c = commitmentMap[sourceId];
      if (c && c.billing_status === 'invoiced') {
        warns.push({
          type: 'DRAFT_MUTATED_SOURCE',
          invoice_id: line.invoice_id,
          commitment_id: sourceId,
          message: 'Draft invoice exists but commitment is already marked invoiced (legacy behavior)',
        });
      }
    }

    return Response.json({
      success: true,
      project_id: project_id || 'ALL',
      scan_scope: {
        invoices: invoices.length,
        lines: allLines.length,
        commitments: commitments.length,
        services: serviceCommitments.length,
        credits: credits.length,
      },
      blocking_issues: blocking,
      warnings: warns,
      repair_candidates: repairs,
      counts: {
        blocking: blocking.length,
        warnings: warns.length,
        repairs: repairs.length,
      },
    });
  } catch (error) {
    console.error('auditInvoiceIntegrity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});