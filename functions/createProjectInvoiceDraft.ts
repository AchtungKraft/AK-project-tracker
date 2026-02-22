import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createProjectInvoiceDraft - PHASE 10 Forward Invoice System
 * 
 * Creates a draft ProjectInvoice with lines.
 * 
 * CRITICAL RULE: Draft creation does NOT mutate ProjectCreditLedger.
 * Credit is only PREVIEWED, not applied. Actual application happens in markInvoicePaid.
 * 
 * Inputs:
 * - project_id (required)
 * - invoice_type: deposit|progress|final (required)
 * - preview_credit: boolean (default true) - whether to calculate credit_preview
 * - lines: array of { type, part_commitment_id?, description, qty?, unit_price }
 * 
 * Returns:
 * - invoice_id, totals, credit_preview_detail (NOT applied), warnings[]
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { 
      project_id, 
      invoice_type, 
      preview_credit = true, 
      lines = [],
      notes 
    } = payload;

    // Validate required fields
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }
    if (!invoice_type || !['deposit', 'progress', 'final'].includes(invoice_type)) {
      return Response.json({ error: 'invoice_type must be deposit|progress|final' }, { status: 400 });
    }
    if (!lines || lines.length === 0) {
      return Response.json({ error: 'At least one line is required' }, { status: 400 });
    }

    // Validate project exists
    const projects = await base44.entities.Project.filter({ id: project_id });
    if (projects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const warnings = [];
    const lineResults = [];

    // Validate lines and compute line_total
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (!line.type || !['part', 'outside_cost', 'manual'].includes(line.type)) {
        return Response.json({ error: `Line ${i}: type must be part|outside_cost|manual` }, { status: 400 });
      }
      if (!line.description) {
        return Response.json({ error: `Line ${i}: description required` }, { status: 400 });
      }

      let lineTotal = 0;
      const qty = line.qty ?? null;
      const unitPrice = line.unit_price ?? 0;

      // For part lines, validate commitment
      if (line.type === 'part') {
        if (!line.part_commitment_id) {
          return Response.json({ error: `Line ${i}: part_commitment_id required for part lines` }, { status: 400 });
        }

        const commitments = await base44.entities.PartCommitment.filter({ id: line.part_commitment_id });
        if (commitments.length === 0) {
          return Response.json({ error: `Line ${i}: Commitment not found` }, { status: 400 });
        }

        const commitment = commitments[0];
        if (commitment.project_id !== project_id) {
          return Response.json({ error: `Line ${i}: Commitment does not belong to this project` }, { status: 400 });
        }

        // Calculate remaining to bill qty
        const required = commitment.required_total ?? 0;
        const alreadyInvoiced = commitment.invoiced_qty ?? 0;
        const remainingQty = Math.max(0, required - alreadyInvoiced);

        if (qty !== null && qty > remainingQty) {
          warnings.push({
            line: i,
            message: `Qty ${qty} exceeds remaining ${remainingQty}. Clamping to remaining.`,
          });
        }

        const effectiveQty = qty !== null ? Math.min(qty, remainingQty) : remainingQty;
        lineTotal = effectiveQty * unitPrice;

        lineResults.push({
          ...line,
          qty: effectiveQty,
          unit_price: unitPrice,
          line_total: lineTotal,
          sort_order: i,
        });
      } else {
        // outside_cost or manual
        if (qty !== null && unitPrice > 0) {
          lineTotal = qty * unitPrice;
        } else {
          lineTotal = unitPrice; // Manual amount
        }

        lineResults.push({
          ...line,
          qty: qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          sort_order: i,
        });
      }
    }

    // Compute subtotal
    const subtotal = lineResults.reduce((sum, l) => sum + (l.line_total || 0), 0);

    // PREVIEW credit (DO NOT MUTATE LEDGER)
    let creditPreview = 0;
    const creditPreviewDetail = [];

    if (preview_credit && subtotal > 0) {
      const credits = await base44.entities.ProjectCreditLedger.filter({
        project_id,
      });

      const availableCredits = credits
        .filter(c => (c.remaining_amount ?? 0) > 0)
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

      let remainingToPreview = subtotal;

      for (const credit of availableCredits) {
        if (remainingToPreview <= 0) break;

        const available = credit.remaining_amount ?? 0;
        const toPreview = Math.min(available, remainingToPreview);

        creditPreview += toPreview;
        remainingToPreview -= toPreview;

        creditPreviewDetail.push({
          credit_id: credit.id,
          source_invoice_id: credit.source_invoice_id,
          amount_available: available,
          amount_preview: toPreview,
        });
      }
    }

    const total = subtotal;
    // balance_due is subtotal minus PREVIEW (actual credit applied at payment)
    const balanceDue = Math.max(0, subtotal - creditPreview);

    // Create invoice - NO credit_applied yet (only preview)
    const invoice = await base44.asServiceRole.entities.ProjectInvoice.create({
      project_id,
      invoice_type,
      status: 'draft',
      subtotal,
      credit_preview: creditPreview,  // PREVIEW ONLY - not deducted from ledger
      credit_applied: 0,              // ALWAYS 0 for drafts
      total,
      balance_due: balanceDue,
      notes: notes || null,
    });

    // Create invoice lines
    const createdLines = [];
    for (const line of lineResults) {
      const createdLine = await base44.asServiceRole.entities.ProjectInvoiceLine.create({
        invoice_id: invoice.id,
        type: line.type,
        part_commitment_id: line.part_commitment_id || null,
        description: line.description,
        qty: line.qty,
        unit_price: line.unit_price,
        line_total: line.line_total,
        sort_order: line.sort_order,
      });
      createdLines.push(createdLine);
    }

    return Response.json({
      success: true,
      invoice_id: invoice.id,
      invoice: {
        id: invoice.id,
        project_id,
        invoice_type,
        status: 'draft',
        subtotal,
        credit_preview: creditPreview,  // Preview only
        credit_applied: 0,              // Not applied yet
        total,
        balance_due: balanceDue,
      },
      lines: createdLines.length,
      credit_preview_detail: creditPreviewDetail.length > 0 ? creditPreviewDetail : null,
      ledger_mutated: false,  // Explicit confirmation
      warnings,
    });

  } catch (error) {
    console.error('createProjectInvoiceDraft error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});