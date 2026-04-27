import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * createProjectInvoiceDraft — UNIFIED INVOICE DRAFT CREATION
 *
 * PHASE 3 RULES:
 * 1. Creates ProjectInvoice (status=draft) + ProjectInvoiceLine rows
 * 2. Does NOT mutate PartCommitment (no invoiced_qty, no billing_status)
 * 3. Does NOT mutate ServiceCommitment (no is_billed, no invoice_id)
 * 4. Does NOT deduct credit from ledger — stores credit_proposed only
 * 5. Validates lines against canonical resolver output
 *
 * Supports line types: part, service, manual, outside_cost
 *
 * Inputs:
 * - project_id (required)
 * - invoice_type: deposit|progress|final (required)
 * - credit_to_apply: number (proposed credit, not deducted yet)
 * - lines: [{ type, source_id?, source_entity?, description, qty, unit_price }]
 * - notes: string
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
      credit_to_apply = 0,
      lines = [],
      notes,
    } = payload;

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }
    if (!invoice_type || !['deposit', 'progress', 'final'].includes(invoice_type)) {
      return Response.json({ error: 'invoice_type must be deposit|progress|final' }, { status: 400 });
    }
    if (!lines || lines.length === 0) {
      return Response.json({ error: 'At least one line is required' }, { status: 400 });
    }

    // Verify project exists
    const projects = await base44.entities.Project.filter({ id: project_id });
    if (projects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // ── Prefetch source records for validation ──
    const partCommitmentIds = lines
      .filter(l => l.type === 'part' && l.source_id)
      .map(l => l.source_id);

    const serviceCommitmentIds = lines
      .filter(l => l.type === 'service' && l.source_id)
      .map(l => l.source_id);

    const [allPartCommitments, allServiceCommitments, allParts, allVendors, allCategories] = await Promise.all([
      partCommitmentIds.length > 0
        ? base44.entities.PartCommitment.filter({ project_id })
        : [],
      serviceCommitmentIds.length > 0
        ? base44.entities.ServiceCommitment.filter({ project_id }).catch(() => [])
        : [],
      base44.entities.Part.list(),
      base44.entities.Vendor.list(),
      base44.entities.PartCategory.list(),
    ]);

    const pcMap = new Map(allPartCommitments.map(c => [c.id, c]));
    const scMap = new Map(allServiceCommitments.map(s => [s.id, s]));
    const partMap = new Map(allParts.map(p => [p.id, p]));
    const vendorMap = new Map(allVendors.map(v => [v.id, v]));
    const catMap = new Map(allCategories.map(c => [c.id, c]));

    const warnings = [];
    const blockedLines = [];
    const validatedLines = [];

    // ── Validate each line ──
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.type || !['part', 'service', 'manual', 'outside_cost'].includes(line.type)) {
        return Response.json({ error: `Line ${i}: type must be part|service|manual|outside_cost` }, { status: 400 });
      }
      if (!line.description) {
        return Response.json({ error: `Line ${i}: description required` }, { status: 400 });
      }

      // ── PART LINE ──
      if (line.type === 'part') {
        if (!line.source_id) {
          return Response.json({ error: `Line ${i}: source_id required for part lines` }, { status: 400 });
        }

        const commitment = pcMap.get(line.source_id);
        if (!commitment) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'NOT_FOUND', message: 'PartCommitment not found' });
          continue;
        }
        if (commitment.project_id !== project_id) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'WRONG_PROJECT', message: 'Commitment does not belong to this project' });
          continue;
        }
        if (commitment.cancelled_at || commitment.is_archived === true) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'CANCELLED_OR_ARCHIVED', message: 'Commitment is cancelled or archived' });
          continue;
        }

        // CANONICAL: effective_required = required_total - qty_removed
        const requiredTotal = commitment.required_total ?? 0;
        const qtyRemoved = commitment.qty_removed ?? 0;
        const effectiveRequired = Math.max(0, requiredTotal - qtyRemoved);
        const invoicedQty = commitment.invoiced_qty ?? 0;
        const qtyAvailable = Math.max(0, effectiveRequired - invoicedQty);

        if (qtyAvailable <= 0) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'NO_OUTSTANDING', message: `No qty available (effective: ${effectiveRequired}, invoiced: ${invoicedQty})` });
          continue;
        }

        const effectiveQty = Math.min(line.qty ?? qtyAvailable, qtyAvailable);
        const unitPrice = line.unit_price ?? commitment.unit_retail_snapshot ?? 0;
        const unitCost = commitment.unit_cost_snapshot ?? 0;
        const lineTotal = effectiveQty * unitPrice;

        const part = partMap.get(commitment.part_id);
        const vendor = part?.default_vendor_id ? vendorMap.get(part.default_vendor_id) : null;
        const category = part?.part_category_id ? catMap.get(part.part_category_id) : null;

        let needsReview = false;
        let reviewReason = null;
        if (unitPrice <= 0) {
          needsReview = true;
          reviewReason = 'MISSING_RETAIL: Unit retail is 0.';
          warnings.push({ line: i, code: 'MISSING_RETAIL', message: `Line ${i}: Retail price is $0.` });
        }

        validatedLines.push({
          type: 'part',
          source_entity: 'PartCommitment',
          source_id: line.source_id,
          part_commitment_id: line.source_id, // backward compat
          part_id: commitment.part_id,
          part_name: part?.part_name || line.description,
          part_number: part?.vendor_part_number || null,
          description: line.description || part?.part_name || 'Part',
          qty: effectiveQty,
          unit_price: unitPrice,
          line_total: lineTotal,
          unit_cost: unitCost,
          cost_total: effectiveQty * unitCost,
          vendor_id: vendor?.id || null,
          vendor_name: vendor?.vendor_name || null,
          category_id: category?.id || null,
          category_name: category?.name || null,
          needs_review: needsReview,
          review_reason: reviewReason,
          sort_order: i,
        });
      }

      // ── SERVICE LINE ──
      else if (line.type === 'service') {
        if (!line.source_id) {
          return Response.json({ error: `Line ${i}: source_id required for service lines` }, { status: 400 });
        }

        const sc = scMap.get(line.source_id);
        if (!sc) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'NOT_FOUND', message: 'ServiceCommitment not found' });
          continue;
        }
        if (sc.project_id !== project_id) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'WRONG_PROJECT', message: 'ServiceCommitment does not belong to this project' });
          continue;
        }
        // CANONICAL: Unified billing lock — must match all resolvers
        const isServiceBilled = sc.is_billed === true || sc.status === 'billed' || !!sc.invoice_id;
        if (isServiceBilled) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'ALREADY_BILLED', message: 'Service is already billed' });
          continue;
        }

        const totalBillable = sc.total_billable ?? 0;
        const totalCost = sc.total_cost ?? 0;

        if (totalBillable <= 0) {
          blockedLines.push({ line: i, source_id: line.source_id, reason: 'ZERO_BILLABLE', message: 'Service has $0 billable amount' });
          continue;
        }

        validatedLines.push({
          type: 'service',
          source_entity: 'ServiceCommitment',
          source_id: line.source_id,
          part_commitment_id: null, // services do NOT use this field
          part_id: null,
          part_name: null,
          part_number: null,
          description: line.description || sc.description || 'Service',
          qty: 1,
          unit_price: totalBillable,
          line_total: totalBillable,
          unit_cost: totalCost,
          cost_total: totalCost,
          vendor_id: sc.vendor_id || null,
          vendor_name: null,
          category_id: null,
          category_name: 'Service',
          needs_review: false,
          review_reason: null,
          sort_order: i,
          metadata: {
            service_id: sc.service_id,
            service_commitment_id: sc.id,
            service_status: sc.status,
          },
        });
      }

      // ── MANUAL / OUTSIDE_COST LINE ──
      else {
        const qty = line.qty ?? 1;
        const unitPrice = line.unit_price ?? 0;
        const lineTotal = qty * unitPrice;

        validatedLines.push({
          type: line.type,
          source_entity: 'Manual',
          source_id: null,
          part_commitment_id: null,
          part_id: null,
          part_name: null,
          part_number: null,
          description: line.description,
          qty,
          unit_price: unitPrice,
          line_total: lineTotal,
          unit_cost: null,
          cost_total: null,
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

    // All blocked?
    if (validatedLines.length === 0 && blockedLines.length > 0) {
      return Response.json({
        success: false,
        error: 'All lines were blocked',
        blocked_lines: blockedLines,
        warnings,
      }, { status: 400 });
    }

    // ── Compute totals ──
    const subtotal = validatedLines.reduce((s, l) => s + (l.line_total || 0), 0);

    // ── Validate proposed credit ──
    const proposedCredit = Math.max(0, parseFloat(credit_to_apply) || 0);
    if (proposedCredit > 0) {
      const credits = await base44.entities.ProjectCreditLedger.filter({ project_id });
      const totalAvailable = credits.reduce((s, c) => s + (c.remaining_amount ?? 0), 0);
      if (proposedCredit > totalAvailable) {
        return Response.json({ error: `Proposed credit (${proposedCredit}) exceeds available (${totalAvailable})` }, { status: 400 });
      }
      if (proposedCredit > subtotal) {
        return Response.json({ error: `Proposed credit (${proposedCredit}) exceeds subtotal (${subtotal})` }, { status: 400 });
      }
    }

    const balanceDue = Math.max(0, subtotal - proposedCredit);

    // ── Create invoice (DRAFT — NO source mutations) ──
    const invoice = await base44.asServiceRole.entities.ProjectInvoice.create({
      project_id,
      invoice_type,
      status: 'draft',
      subtotal,
      credit_proposed: proposedCredit,
      credit_applied: 0, // NOT applied yet — only at sent
      credit_preview: proposedCredit, // backward compat
      total: subtotal,
      balance_due: balanceDue,
      notes: notes || null,
    });

    // ── Create line items ──
    const createdLines = [];
    for (const line of validatedLines) {
      const created = await base44.asServiceRole.entities.ProjectInvoiceLine.create({
        invoice_id: invoice.id,
        type: line.type,
        source_entity: line.source_entity,
        source_id: line.source_id,
        part_commitment_id: line.part_commitment_id, // backward compat for parts
        part_id: line.part_id,
        part_name: line.part_name,
        part_number: line.part_number,
        description: line.description,
        qty: line.qty,
        unit_price: line.unit_price,
        line_total: line.line_total,
        unit_cost: line.unit_cost,
        cost_total: line.cost_total,
        vendor_id: line.vendor_id,
        vendor_name: line.vendor_name,
        category_id: line.category_id,
        category_name: line.category_name,
        needs_review: line.needs_review,
        review_reason: line.review_reason,
        sort_order: line.sort_order,
        metadata: line.metadata || null,
      });
      createdLines.push(created);
    }

    // ── Phase 5: Invoice Integrity Summary ──
    const partsTotal = validatedLines.filter(l => l.type === 'part').reduce((s, l) => s + (l.line_total || 0), 0);
    const servicesTotal = validatedLines.filter(l => l.type === 'service').reduce((s, l) => s + (l.line_total || 0), 0);
    const manualTotal = validatedLines.filter(l => l.type === 'manual' || l.type === 'outside_cost').reduce((s, l) => s + (l.line_total || 0), 0);
    const computedTotal = partsTotal + servicesTotal + manualTotal;

    console.log("Invoice Integrity Summary", {
      invoice_id: invoice.id,
      line_count: createdLines.length,
      total_amount: subtotal,
      parts_total: partsTotal,
      services_total: servicesTotal,
      manual_total: manualTotal,
    });

    // ── Phase 6: Total Validation Guard ──
    if (Math.abs(computedTotal - subtotal) > 0.01) {
      console.error("Invoice total mismatch", {
        invoice_id: invoice.id,
        expected: computedTotal,
        actual: subtotal,
        diff: computedTotal - subtotal,
      });
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
        credit_proposed: proposedCredit,
        credit_applied: 0,
        total: subtotal,
        balance_due: balanceDue,
      },
      lines_created: createdLines.length,
      lines_needing_review: validatedLines.filter(l => l.needs_review).length,
      blocked_lines: blockedLines.length > 0 ? blockedLines : null,
      warnings: warnings.length > 0 ? warnings : null,
      // CANONICAL: Draft does NOT mutate any source records
      source_records_mutated: false,
      credit_ledger_mutated: false,
      // Phase 5: Integrity breakdown
      integrity: {
        parts_total: partsTotal,
        services_total: servicesTotal,
        manual_total: manualTotal,
        computed_total: computedTotal,
        invoice_total: subtotal,
        totals_match: Math.abs(computedTotal - subtotal) <= 0.01,
      },
    });
  } catch (error) {
    console.error('createProjectInvoiceDraft error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});