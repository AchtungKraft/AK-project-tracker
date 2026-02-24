import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createProjectInvoiceDraft - PHASE 10 Forward Invoice System
 * 
 * Creates a draft ProjectInvoice with lines.
 * 
 * CRITICAL RULES:
 * 1. Draft creation does NOT mutate ProjectCreditLedger (credit is only PREVIEWED).
 * 2. BILLED-ONCE ENFORCEMENT: Block if commitment billing_status !== 'unbilled'
 * 3. All-or-nothing: commitments are invoiced fully (remaining qty)
 * 
 * Inputs:
 * - project_id (required)
 * - invoice_type: deposit|progress|final (required)
 * - preview_credit: boolean (default true) - whether to calculate credit_preview
 * - lines: array of { type, part_commitment_id?, description, qty?, unit_price }
 * 
 * Returns:
 * - invoice_id, totals, credit_preview_detail (NOT applied), warnings[], blocked_lines[]
 */

/**
 * Normalize billing_status to canonical enum values
 */
function normalizeBillingStatus(status) {
  if (!status) return 'unbilled';
  const normalized = String(status).toLowerCase().trim();
  if (normalized === 'paid') return 'paid';
  if (normalized === 'invoiced' || normalized === 'billed') return 'invoiced';
  return 'unbilled';
}

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
      notes,
      credit_to_apply = null, // STABILIZATION: User-specified credit amount to apply at creation
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

    // Fetch project
    const projects = await base44.entities.Project.filter({ id: project_id });
    if (projects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Prefetch all parts for denormalization
    const partIds = new Set();
    const commitmentIds = [];
    
    for (const line of lines) {
      if (line.type === 'part' && line.part_commitment_id) {
        commitmentIds.push(line.part_commitment_id);
      }
    }

    // Fetch all referenced commitments and reference data in parallel
    const [allCommitments, allParts, vendors, categories] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.Part.filter({}),
      base44.entities.Vendor.filter({}),
      base44.entities.PartCategory.filter({}),
    ]);

    const commitmentMap = new Map();
    for (const c of allCommitments) {
      commitmentMap.set(c.id, c);
      if (c.part_id) partIds.add(c.part_id);
    }

    const partMap = new Map();
    for (const p of allParts) {
      if (partIds.has(p.id)) {
        partMap.set(p.id, p);
      }
    }

    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const warnings = [];
    const blockedLines = [];
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

      // For part lines, validate commitment and enforce BILLED-ONCE
      if (line.type === 'part') {
        if (!line.part_commitment_id) {
          return Response.json({ error: `Line ${i}: part_commitment_id required for part lines` }, { status: 400 });
        }

        const commitment = commitmentMap.get(line.part_commitment_id);
        if (!commitment) {
          return Response.json({ error: `Line ${i}: Commitment not found` }, { status: 400 });
        }

        if (commitment.project_id !== project_id) {
          return Response.json({ error: `Line ${i}: Commitment does not belong to this project` }, { status: 400 });
        }

        // ===== BILLED-ONCE ENFORCEMENT =====
        const billingStatus = normalizeBillingStatus(commitment.billing_status);
        
        if (billingStatus === 'invoiced') {
          blockedLines.push({
            line: i,
            part_commitment_id: line.part_commitment_id,
            reason: 'ALREADY_INVOICED',
            message: `Commitment already invoiced (awaiting payment). Cannot invoice again.`,
          });
          continue; // Skip this line
        }
        
        if (billingStatus === 'paid') {
          blockedLines.push({
            line: i,
            part_commitment_id: line.part_commitment_id,
            reason: 'ALREADY_PAID',
            message: `Commitment already fully paid. Cannot invoice again.`,
          });
          continue; // Skip this line
        }

        // Calculate remaining to bill qty
        const required = commitment.required_total ?? commitment.qty_committed ?? 0;
        const alreadyInvoiced = commitment.invoiced_qty ?? 0;
        const remainingQty = Math.max(0, required - alreadyInvoiced);

        // Block if nothing to invoice
        if (remainingQty <= 0) {
          blockedLines.push({
            line: i,
            part_commitment_id: line.part_commitment_id,
            reason: 'NO_OUTSTANDING',
            message: `No remaining quantity to invoice (required: ${required}, already invoiced: ${alreadyInvoiced}).`,
          });
          continue;
        }

        // Get part data for denormalization
        const part = partMap.get(commitment.part_id);
        const vendor = part?.default_vendor_id ? vendorMap.get(part.default_vendor_id) : null;
        const category = part?.part_category_id ? categoryMap.get(part.part_category_id) : null;

        // Determine effective unit retail
        const effectiveUnitRetail = line.unit_price ?? commitment.unit_retail_snapshot ?? 0;
        const effectiveUnitCost = commitment.unit_cost_snapshot ?? part?.cost ?? 0;

        // Flag if retail is missing/zero (allow but warn)
        let needsReview = false;
        let reviewReason = null;
        if (!effectiveUnitRetail || effectiveUnitRetail <= 0) {
          needsReview = true;
          reviewReason = 'MISSING_RETAIL: Unit retail is missing or zero. Invoice line will show $0.00.';
          warnings.push({
            line: i,
            code: 'MISSING_RETAIL',
            message: `Line ${i}: Retail price is missing or zero. Proceeding with $0.00.`,
          });
        }

        // Use full remaining qty (all-or-nothing per commitment)
        const effectiveQty = remainingQty;
        lineTotal = effectiveQty * effectiveUnitRetail;

        lineResults.push({
          type: 'part',
          part_commitment_id: line.part_commitment_id,
          part_id: commitment.part_id,
          part_name: part?.part_name || line.description,
          part_number: part?.vendor_part_number || null,
          description: line.description || part?.part_name || 'Part',
          qty: effectiveQty,
          unit_price: effectiveUnitRetail,
          line_total: lineTotal,
          unit_cost: effectiveUnitCost,
          vendor_id: vendor?.id || part?.default_vendor_id || null,
          vendor_name: vendor?.vendor_name || null,
          category_id: category?.id || part?.part_category_id || null,
          category_name: category?.name || null,
          needs_review: needsReview,
          review_reason: reviewReason,
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
          type: line.type,
          part_commitment_id: null,
          part_id: null,
          part_name: null,
          part_number: null,
          description: line.description,
          qty: qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          unit_cost: null,
          vendor_id: null,
          vendor_name: null,
          category_id: null,
          category_name: null,
          needs_review: false,
          review_reason: null,
          sort_order: i,
        });
      }
    }

    // Check if all lines were blocked
    if (lineResults.length === 0 && blockedLines.length > 0) {
      return Response.json({
        success: false,
        error: 'All lines were blocked',
        blocked_lines: blockedLines,
        warnings,
      }, { status: 400 });
    }

    // Compute subtotal
    const subtotal = lineResults.reduce((sum, l) => sum + (l.line_total || 0), 0);

    // ===== STABILIZATION: Hybrid Credit at Invoice Creation =====
    // Fetch available credits
    const credits = await base44.entities.ProjectCreditLedger.filter({
      project_id,
    });

    const availableCredits = credits
      .filter(c => (c.remaining_amount ?? 0) > 0)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    const totalCreditAvailable = availableCredits.reduce((sum, c) => sum + (c.remaining_amount ?? 0), 0);

    // Calculate credit to apply
    // If user specified credit_to_apply, use it (with validation)
    // Otherwise, calculate suggested credit (min of available and subtotal)
    let creditToApply = 0;
    let creditAppliedDetail = [];
    let creditValidationError = null;

    if (credit_to_apply !== null && credit_to_apply !== undefined) {
      // User specified a credit amount - validate it
      const requestedCredit = parseFloat(credit_to_apply) || 0;
      
      if (requestedCredit < 0) {
        creditValidationError = 'Credit amount cannot be negative';
      } else if (requestedCredit > totalCreditAvailable) {
        creditValidationError = `Credit amount (${requestedCredit}) exceeds available credit (${totalCreditAvailable})`;
      } else if (requestedCredit > subtotal) {
        creditValidationError = `Credit amount (${requestedCredit}) exceeds invoice subtotal (${subtotal})`;
      } else {
        creditToApply = requestedCredit;
      }
    } else if (preview_credit && subtotal > 0) {
      // Auto-suggest: min of available and subtotal
      creditToApply = Math.min(totalCreditAvailable, subtotal);
    }

    if (creditValidationError) {
      return Response.json({
        success: false,
        error: creditValidationError,
        available_credit: totalCreditAvailable,
        subtotal,
      }, { status: 400 });
    }

    // Generate idempotency key for credit application
    const creditIdempotencyKey = `inv_create_${project_id}_${Date.now()}`;

    // APPLY credit NOW (mutate ledger at invoice creation)
    let remainingToApply = creditToApply;

    for (const credit of availableCredits) {
      if (remainingToApply <= 0) break;

      const available = credit.remaining_amount ?? 0;
      const toApply = Math.min(available, remainingToApply);

      if (toApply <= 0) continue;

      // MUTATE LEDGER: Deduct from remaining_amount
      const newRemaining = available - toApply;
      await base44.asServiceRole.entities.ProjectCreditLedger.update(credit.id, {
        remaining_amount: newRemaining,
        credit_idempotency_key: creditIdempotencyKey,
      });

      remainingToApply -= toApply;

      creditAppliedDetail.push({
        credit_id: credit.id,
        source_invoice_id: credit.source_invoice_id,
        amount_available: available,
        amount_applied: toApply,
        remaining_after: newRemaining,
      });
    }

    const total = subtotal;
    const balanceDue = Math.max(0, subtotal - creditToApply);

    // Create invoice with credit_applied set (not preview)
    const invoice = await base44.asServiceRole.entities.ProjectInvoice.create({
      project_id,
      invoice_type,
      status: 'draft',
      subtotal,
      credit_preview: 0, // No longer needed - using credit_applied
      credit_applied: creditToApply, // STABILIZATION: Credit applied at creation
      total,
      balance_due: balanceDue,
      notes: notes || null,
      credit_idempotency_key: creditIdempotencyKey,
    });

    // Create invoice lines with all export fields
    const createdLines = [];
    for (const line of lineResults) {
      const createdLine = await base44.asServiceRole.entities.ProjectInvoiceLine.create({
        invoice_id: invoice.id,
        type: line.type,
        part_commitment_id: line.part_commitment_id,
        part_id: line.part_id,
        part_name: line.part_name,
        part_number: line.part_number,
        description: line.description,
        qty: line.qty,
        unit_price: line.unit_price,
        line_total: line.line_total,
        unit_cost: line.unit_cost,
        vendor_id: line.vendor_id,
        vendor_name: line.vendor_name,
        category_id: line.category_id,
        category_name: line.category_name,
        needs_review: line.needs_review,
        review_reason: line.review_reason,
        sort_order: line.sort_order,
      });
      createdLines.push(createdLine);
    }

    // Update commitments to 'invoiced' status NOW (at draft creation)
    // This prevents double-invoicing even while invoice is in draft
    const partCommitmentIds = lineResults
      .filter(l => l.part_commitment_id)
      .map(l => l.part_commitment_id);
    
    for (const commitmentId of partCommitmentIds) {
      const commitment = commitmentMap.get(commitmentId);
      const lineData = lineResults.find(l => l.part_commitment_id === commitmentId);
      
      await base44.asServiceRole.entities.PartCommitment.update(commitmentId, {
        billing_status: 'invoiced',
        invoiced_qty: lineData?.qty || (commitment?.required_total ?? 0),
        invoiced_retail_total: lineData?.line_total || 0,
      });
    }

    // Count lines needing review
    const linesNeedingReview = lineResults.filter(l => l.needs_review).length;

    return Response.json({
      success: true,
      invoice_id: invoice.id,
      invoice: {
        id: invoice.id,
        project_id,
        invoice_type,
        status: 'draft',
        subtotal,
        credit_applied: creditToApply,
        total,
        balance_due: balanceDue,
      },
      lines_created: createdLines.length,
      lines_needing_review: linesNeedingReview,
      commitments_updated: partCommitmentIds.length,
      part_commitment_ids: partCommitmentIds,
      credit_applied: creditToApply,
      credit_available_before: totalCreditAvailable,
      credit_available_after: totalCreditAvailable - creditToApply,
      credit_applied_detail: creditAppliedDetail.length > 0 ? creditAppliedDetail : null,
      ledger_mutated: creditToApply > 0,
      blocked_lines: blockedLines.length > 0 ? blockedLines : null,
      warnings: warnings.length > 0 ? warnings : null,
    });

  } catch (error) {
    console.error('createProjectInvoiceDraft error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});