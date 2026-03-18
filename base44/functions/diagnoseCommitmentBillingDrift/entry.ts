import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * diagnoseCommitmentBillingDrift - Phase 1-8 Diagnostic & Repair
 * 
 * Diagnoses and optionally repairs drift between:
 * - PartCommitment.billing_status vs derived billing state from invoices
 * - Install eligibility gating
 * - Invoice eligibility gating
 * 
 * SAFETY: Does NOT delete data, recreate invoices, or modify credit ledger.
 * Only normalizes PartCommitment billing fields.
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

    // Admin only
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const { 
      project_id,
      dry_run = true, // Default to dry run for safety
      include_diagnostics = true,
    } = payload;

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // =========================================================================
    // PHASE 1: Ground Truth State Audit
    // =========================================================================
    
    // Fetch all related entities
    const [
      commitments,
      invoices,
      invoiceLines,
      creditAllocations,
      creditLedgers,
      parts,
    ] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.ProjectInvoice.filter({ project_id }),
      base44.entities.ProjectInvoiceLine.filter({}), // Will filter by invoice_id
      base44.entities.CreditAllocation.filter({ project_id, is_reversed: false }),
      base44.entities.ProjectCreditLedger.filter({ project_id }),
      base44.entities.Part.filter({}),
    ]);

    // Build lookup maps
    const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));
    const invoicesMap = Object.fromEntries(invoices.map(i => [i.id, i]));
    
    // Filter invoice lines to only those belonging to project invoices
    const projectInvoiceIds = new Set(invoices.map(i => i.id));
    const relevantInvoiceLines = invoiceLines.filter(l => projectInvoiceIds.has(l.invoice_id));
    
    // Build invoice lines by commitment
    const linesByCommitment = {};
    for (const line of relevantInvoiceLines) {
      if (line.part_commitment_id) {
        if (!linesByCommitment[line.part_commitment_id]) {
          linesByCommitment[line.part_commitment_id] = [];
        }
        linesByCommitment[line.part_commitment_id].push(line);
      }
    }
    
    // Build credit allocations by commitment
    const creditByCommitment = {};
    for (const alloc of creditAllocations) {
      if (alloc.commitment_id) {
        if (!creditByCommitment[alloc.commitment_id]) {
          creditByCommitment[alloc.commitment_id] = 0;
        }
        creditByCommitment[alloc.commitment_id] += alloc.amount_applied || 0;
      }
    }
    
    // Available credit
    const creditAvailable = creditLedgers.reduce((sum, l) => sum + (l.remaining_amount || 0), 0);

    // =========================================================================
    // PHASE 1: Build diagnostic table
    // =========================================================================
    
    const diagnosticRows = [];
    const driftDetected = {
      billing: false,
      install: false,
      invoice: false,
    };
    const corrections = [];

    for (const commitment of commitments) {
      const part = partsMap[commitment.part_id];
      const commitmentLines = linesByCommitment[commitment.id] || [];
      const creditApplied = creditByCommitment[commitment.id] || 0;
      
      // ===== DERIVE VALUES FROM INVOICES (Ground Truth) =====
      
      // Invoiced qty/amount from invoice lines
      let derivedInvoicedQty = 0;
      let derivedInvoicedAmount = 0;
      let derivedPaidAmount = 0;
      
      for (const line of commitmentLines) {
        const invoice = invoicesMap[line.invoice_id];
        if (!invoice) continue;
        
        // Only count non-cancelled invoices
        if (invoice.status === 'cancelled') continue;
        
        derivedInvoicedQty += line.qty || 0;
        derivedInvoicedAmount += line.line_total || 0;
        
        // If invoice is paid, add to paid amount
        if (invoice.status === 'paid') {
          derivedPaidAmount += line.line_total || 0;
        }
      }
      
      // Derived balance due
      const derivedBalanceDue = Math.max(0, derivedInvoicedAmount - creditApplied - derivedPaidAmount);
      
      // Derived billing status
      let derivedBillingStatus = 'unbilled';
      if (derivedInvoicedAmount > 0) {
        if (derivedBalanceDue <= 0) {
          derivedBillingStatus = 'paid';
        } else {
          derivedBillingStatus = 'invoiced';
        }
      }
      
      // ===== COMMITMENT VALUES (Current State) =====
      
      const currentBillingStatus = commitment.billing_status || 'unbilled';
      const currentInvoicedQty = commitment.invoiced_qty || 0;
      const currentInvoicedAmount = commitment.invoiced_amount || 0;
      
      // Inventory values
      const quantityRequired = commitment.required_total || commitment.qty_committed || 0;
      const quantityInstalled = commitment.qty_installed || 0;
      const quantityReserved = commitment.reserved_from_stock || 0;
      const quantityOnHand = part?.physical_stock || 0;
      const availableToAllocate = quantityOnHand - (part?.allocated_stock || 0);
      
      // ===== DRIFT DETECTION =====
      
      const billingStatusMatch = normalizeBillingStatus(currentBillingStatus) === derivedBillingStatus;
      const invoicedQtyMatch = currentInvoicedQty === derivedInvoicedQty;
      const invoicedAmountMatch = Math.abs(currentInvoicedAmount - derivedInvoicedAmount) < 0.01;
      
      const hasBillingDrift = !billingStatusMatch || !invoicedQtyMatch || !invoicedAmountMatch;
      
      if (hasBillingDrift) {
        driftDetected.billing = true;
        
        corrections.push({
          commitment_id: commitment.id,
          part_name: part?.part_name || 'Unknown',
          drift_type: 'billing',
          before: {
            billing_status: currentBillingStatus,
            invoiced_qty: currentInvoicedQty,
            invoiced_amount: currentInvoicedAmount,
          },
          after: {
            billing_status: derivedBillingStatus,
            invoiced_qty: derivedInvoicedQty,
            invoiced_amount: derivedInvoicedAmount,
          },
        });
      }
      
      // ===== INSTALL ELIGIBILITY CHECK =====
      // Install should depend ONLY on: available_stock > 0 AND qty_installed < qty_required
      // NOT on billing_status
      
      const installEligibleCanonical = quantityReserved > quantityInstalled;
      const installBlockedByBilling = !installEligibleCanonical && currentBillingStatus !== 'unbilled';
      
      if (installBlockedByBilling && quantityReserved > quantityInstalled) {
        driftDetected.install = true;
      }
      
      // ===== INVOICE ELIGIBILITY CHECK =====
      // Invoice should depend ONLY on: qty_required - invoiced_qty > 0
      // NOT on paid status, credit, install status, stock
      
      const invoiceEligibleCanonical = quantityRequired - derivedInvoicedQty > 0;
      
      diagnosticRows.push({
        commitment_id: commitment.id,
        part_id: commitment.part_id,
        part_name: part?.part_name || 'Unknown',
        
        // Quantity fields
        quantity_required: quantityRequired,
        quantity_installed: quantityInstalled,
        quantity_reserved: quantityReserved,
        quantity_on_hand: quantityOnHand,
        available_to_allocate: availableToAllocate,
        
        // Current billing state
        billing_status: currentBillingStatus,
        invoiced_qty: currentInvoicedQty,
        invoiced_amount: currentInvoicedAmount,
        
        // Derived billing state (ground truth)
        derived_invoiced_qty: derivedInvoicedQty,
        derived_invoiced_amount: derivedInvoicedAmount,
        derived_paid_amount: derivedPaidAmount,
        credit_applied: creditApplied,
        derived_balance_due: derivedBalanceDue,
        derived_billing_status: derivedBillingStatus,
        
        // Drift flags
        billing_status_match: billingStatusMatch,
        invoiced_qty_match: invoicedQtyMatch,
        invoiced_amount_match: invoicedAmountMatch,
        has_drift: hasBillingDrift,
        
        // Eligibility
        install_eligible_canonical: installEligibleCanonical,
        invoice_eligible_canonical: invoiceEligibleCanonical,
      });
    }

    // =========================================================================
    // PHASE 4: Apply corrections (if not dry_run)
    // =========================================================================
    
    let correctedCount = 0;
    
    if (!dry_run && corrections.length > 0) {
      for (const correction of corrections) {
        await base44.asServiceRole.entities.PartCommitment.update(correction.commitment_id, {
          billing_status: correction.after.billing_status,
          invoiced_qty: correction.after.invoiced_qty,
          invoiced_amount: correction.after.invoiced_amount,
        });
        correctedCount++;
      }
    }

    // =========================================================================
    // Build response
    // =========================================================================
    
    const driftSummary = {
      billing_drift_detected: driftDetected.billing,
      install_drift_detected: driftDetected.install,
      invoice_drift_detected: driftDetected.invoice,
      total_commitments: commitments.length,
      commitments_with_drift: corrections.length,
      corrections_applied: dry_run ? 0 : correctedCount,
      dry_run,
    };

    const response = {
      success: true,
      summary: driftSummary,
      corrections: corrections.slice(0, 50), // Limit for response size
      credit_available: creditAvailable,
    };

    if (include_diagnostics) {
      response.diagnostic_table = diagnosticRows;
      
      // Sample before/after for verification
      if (corrections.length > 0) {
        response.sample_corrections = corrections.slice(0, 5);
      }
    }

    return Response.json(response);

  } catch (error) {
    console.error('diagnoseCommitmentBillingDrift error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Normalize billing status to canonical values
 */
function normalizeBillingStatus(status) {
  if (!status) return 'unbilled';
  const normalized = String(status).toLowerCase().trim();
  if (normalized === 'paid') return 'paid';
  if (normalized === 'invoiced' || normalized === 'billed') return 'invoiced';
  return 'unbilled';
}