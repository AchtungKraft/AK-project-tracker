import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * globalFinancialResetHardDelete - ADMIN ONLY
 * 
 * Hard-deletes ALL invoice + credit data and resets ALL PartCommitment billing fields
 * across ALL projects. Used for test data cleanup.
 * 
 * DOES NOT DELETE:
 * - PartCommitment records (keeps assignments)
 * - Part records
 * - Project records
 * - Procurement/PO/ordering data
 * - Inventory counts / receiving state
 * 
 * DELETES:
 * - ProjectInvoiceLine (all)
 * - ProjectInvoice (all)
 * - ProjectCreditLedger (all)
 * - CreditAllocation (all)
 * 
 * RESETS on ALL PartCommitment:
 * - billing_status = 'unbilled'
 * - invoiced_qty = 0
 * - invoiced_retail_total = 0
 * - invoiced_amount = 0
 * - Clears invoice block reasons
 * 
 * EXECUTION ORDER:
 * 1) Reset PartCommitments first
 * 2) Delete CreditAllocation records
 * 3) Delete ProjectInvoiceLine records
 * 4) Delete ProjectInvoice records
 * 5) Delete ProjectCreditLedger records
 * 
 * Returns:
 * {
 *   success: boolean,
 *   commitments_reset: number,
 *   deleted: {
 *     CreditAllocation: number,
 *     ProjectInvoiceLine: number,
 *     ProjectInvoice: number,
 *     ProjectCreditLedger: number
 *   },
 *   sample_ids: {
 *     commitments_reset: string[],
 *     CreditAllocation: string[],
 *     ProjectInvoiceLine: string[],
 *     ProjectInvoice: string[],
 *     ProjectCreditLedger: string[]
 *   }
 * }
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

    // ADMIN-ONLY GUARD
    if (!user || user.role !== 'admin') {
      return Response.json({ 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }

    const results = {
      success: false,
      commitments_reset: 0,
      deleted: {
        CreditAllocation: 0,
        ProjectInvoiceLine: 0,
        ProjectInvoice: 0,
        ProjectCreditLedger: 0,
      },
      sample_ids: {
        commitments_reset: [],
        CreditAllocation: [],
        ProjectInvoiceLine: [],
        ProjectInvoice: [],
        ProjectCreditLedger: [],
      },
    };

    // =========================================================================
    // STEP 1: Reset ALL PartCommitments billing fields
    // =========================================================================
    console.log('[RESET] Step 1: Fetching all PartCommitments...');
    
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter({});
    console.log(`[RESET] Found ${allCommitments.length} commitments to evaluate`);

    // Filter to only those with billing data to reset
    const commitmentsToReset = allCommitments.filter(c => 
      c.billing_status !== 'unbilled' ||
      (c.invoiced_qty ?? 0) > 0 ||
      (c.invoiced_retail_total ?? 0) > 0 ||
      (c.invoiced_amount ?? 0) > 0 ||
      c.invoice_blocked_reason ||
      c.invoice_override_approved
    );

    console.log(`[RESET] ${commitmentsToReset.length} commitments need billing reset`);

    // Reset each commitment
    for (const c of commitmentsToReset) {
      await base44.asServiceRole.entities.PartCommitment.update(c.id, {
        billing_status: 'unbilled',
        invoiced_qty: 0,
        invoiced_retail_total: 0,
        invoiced_amount: 0,
        // Clear invoice block reasons
        invoice_blocked_reason: null,
        invoice_override_approved: false,
        invoice_override_reason: null,
        invoice_override_by: null,
        invoice_override_at: null,
        // Clear any credit settlement metadata
        covered_retail_total: 0,
        exposure_gap: null,
      });
      results.commitments_reset++;
    }

    // Sample IDs
    results.sample_ids.commitments_reset = commitmentsToReset.slice(0, 5).map(c => c.id);
    console.log(`[RESET] Step 1 complete: ${results.commitments_reset} commitments reset`);

    // =========================================================================
    // STEP 2: Delete ALL CreditAllocation records
    // =========================================================================
    console.log('[RESET] Step 2: Deleting CreditAllocation records...');
    
    const allCreditAllocations = await base44.asServiceRole.entities.CreditAllocation.filter({});
    results.sample_ids.CreditAllocation = allCreditAllocations.slice(0, 5).map(r => r.id);
    
    for (const record of allCreditAllocations) {
      await base44.asServiceRole.entities.CreditAllocation.delete(record.id);
      results.deleted.CreditAllocation++;
    }
    console.log(`[RESET] Step 2 complete: ${results.deleted.CreditAllocation} CreditAllocation deleted`);

    // =========================================================================
    // STEP 3: Delete ALL ProjectInvoiceLine records
    // =========================================================================
    console.log('[RESET] Step 3: Deleting ProjectInvoiceLine records...');
    
    const allInvoiceLines = await base44.asServiceRole.entities.ProjectInvoiceLine.filter({});
    results.sample_ids.ProjectInvoiceLine = allInvoiceLines.slice(0, 5).map(r => r.id);
    
    for (const record of allInvoiceLines) {
      await base44.asServiceRole.entities.ProjectInvoiceLine.delete(record.id);
      results.deleted.ProjectInvoiceLine++;
    }
    console.log(`[RESET] Step 3 complete: ${results.deleted.ProjectInvoiceLine} ProjectInvoiceLine deleted`);

    // =========================================================================
    // STEP 4: Delete ALL ProjectInvoice records
    // =========================================================================
    console.log('[RESET] Step 4: Deleting ProjectInvoice records...');
    
    const allInvoices = await base44.asServiceRole.entities.ProjectInvoice.filter({});
    results.sample_ids.ProjectInvoice = allInvoices.slice(0, 5).map(r => r.id);
    
    for (const record of allInvoices) {
      await base44.asServiceRole.entities.ProjectInvoice.delete(record.id);
      results.deleted.ProjectInvoice++;
    }
    console.log(`[RESET] Step 4 complete: ${results.deleted.ProjectInvoice} ProjectInvoice deleted`);

    // =========================================================================
    // STEP 5: Delete ALL ProjectCreditLedger records
    // =========================================================================
    console.log('[RESET] Step 5: Deleting ProjectCreditLedger records...');
    
    const allCreditLedgers = await base44.asServiceRole.entities.ProjectCreditLedger.filter({});
    results.sample_ids.ProjectCreditLedger = allCreditLedgers.slice(0, 5).map(r => r.id);
    
    for (const record of allCreditLedgers) {
      await base44.asServiceRole.entities.ProjectCreditLedger.delete(record.id);
      results.deleted.ProjectCreditLedger++;
    }
    console.log(`[RESET] Step 5 complete: ${results.deleted.ProjectCreditLedger} ProjectCreditLedger deleted`);

    // =========================================================================
    // DONE
    // =========================================================================
    results.success = true;

    console.log('[RESET] Global financial reset complete:', JSON.stringify(results, null, 2));

    return Response.json(results);

  } catch (error) {
    console.error('[RESET] Error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});