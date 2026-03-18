import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * updateInvoiceDraft - PHASE 10 Forward Invoice System
 * 
 * Updates a draft invoice's lines and notes.
 * Recomputes totals and credit application.
 * 
 * Inputs:
 * - invoice_id (required)
 * - notes (optional)
 * - lines (optional - full replacement)
 * - apply_credit (optional, default true)
 * 
 * Returns updated invoice summary
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
    const { invoice_id, notes, lines, apply_credit = true } = payload;

    // Validate required fields
    if (!invoice_id) {
      return Response.json({ error: 'invoice_id required' }, { status: 400 });
    }

    // Fetch invoice
    const invoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    if (invoices.length === 0) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const invoice = invoices[0];

    // Validate status
    if (invoice.status !== 'draft') {
      return Response.json({ 
        error: `Cannot update: invoice is ${invoice.status}, must be draft` 
      }, { status: 400 });
    }

    const warnings = [];
    let updateData = {};

    // Update notes if provided
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // If lines are provided, replace all lines
    if (lines && Array.isArray(lines)) {
      // Delete existing lines
      const existingLines = await base44.entities.ProjectInvoiceLine.filter({ invoice_id });
      for (const line of existingLines) {
        await base44.asServiceRole.entities.ProjectInvoiceLine.delete(line.id);
      }

      // Create new lines
      const lineResults = [];
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

        if (line.type === 'part' && line.part_commitment_id) {
          const commitments = await base44.entities.PartCommitment.filter({ id: line.part_commitment_id });
          if (commitments.length > 0) {
            const commitment = commitments[0];
            const required = commitment.required_total ?? 0;
            const alreadyInvoiced = commitment.invoiced_qty ?? 0;
            const remainingQty = Math.max(0, required - alreadyInvoiced);

            if (qty !== null && qty > remainingQty) {
              warnings.push({
                line: i,
                message: `Qty ${qty} exceeds remaining ${remainingQty}. Clamping.`,
              });
            }

            const effectiveQty = qty !== null ? Math.min(qty, remainingQty) : remainingQty;
            lineTotal = effectiveQty * unitPrice;

            await base44.asServiceRole.entities.ProjectInvoiceLine.create({
              invoice_id,
              type: line.type,
              part_commitment_id: line.part_commitment_id,
              description: line.description,
              qty: effectiveQty,
              unit_price: unitPrice,
              line_total: lineTotal,
              sort_order: i,
            });

            lineResults.push({ qty: effectiveQty, line_total: lineTotal });
          }
        } else {
          if (qty !== null && unitPrice > 0) {
            lineTotal = qty * unitPrice;
          } else {
            lineTotal = unitPrice;
          }

          await base44.asServiceRole.entities.ProjectInvoiceLine.create({
            invoice_id,
            type: line.type,
            part_commitment_id: line.part_commitment_id || null,
            description: line.description,
            qty,
            unit_price: unitPrice,
            line_total: lineTotal,
            sort_order: i,
          });

          lineResults.push({ qty, line_total: lineTotal });
        }
      }

      // Recompute totals
      const subtotal = lineResults.reduce((sum, l) => sum + (l.line_total || 0), 0);

      // Apply credit if requested
      let creditApplied = 0;
      if (apply_credit && subtotal > 0) {
        const credits = await base44.entities.ProjectCreditLedger.filter({
          project_id: invoice.project_id,
        });

        const availableCredits = credits
          .filter(c => (c.remaining_amount ?? 0) > 0)
          .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

        let remainingToApply = subtotal;
        for (const credit of availableCredits) {
          if (remainingToApply <= 0) break;
          const available = credit.remaining_amount ?? 0;
          const toApply = Math.min(available, remainingToApply);
          creditApplied += toApply;
          remainingToApply -= toApply;
        }
      }

      const total = subtotal;
      const balanceDue = Math.max(0, subtotal - creditApplied);

      updateData = {
        ...updateData,
        subtotal,
        credit_applied: creditApplied,
        total,
        balance_due: balanceDue,
      };
    }

    // Apply update
    if (Object.keys(updateData).length > 0) {
      await base44.asServiceRole.entities.ProjectInvoice.update(invoice_id, updateData);
    }

    // Fetch updated invoice
    const updatedInvoices = await base44.entities.ProjectInvoice.filter({ id: invoice_id });
    const updatedInvoice = updatedInvoices[0];

    return Response.json({
      success: true,
      invoice: updatedInvoice,
      warnings,
    });

  } catch (error) {
    console.error('updateInvoiceDraft error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});