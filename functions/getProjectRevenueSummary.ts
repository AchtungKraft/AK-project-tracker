import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getProjectRevenueSummary - Forward Financial Model Revenue Rollups
 * 
 * For FORWARD projects ONLY, computes revenue metrics from:
 * - PartCommitment (for billable estimates)
 * - InvoiceBatch + InvoiceBatchLine (for invoiced/collected)
 * 
 * Does NOT use:
 * - billing_status fields
 * - pool entities (BillingPool, PoolAllocation, PoolCharge)
 * - exposure_gap
 * - covered_retail_total
 */

Deno.serve(async (req) => {
  console.log("getProjectRevenueSummary invoked");
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    const { project_id } = payload;
    
    if (!project_id) {
      return Response.json({ 
        error: 'project_id is required',
        code: 'MISSING_PROJECT_ID' 
      }, { status: 400 });
    }
    
    // Fetch project to verify financial model
    const projects = await base44.entities.Project.filter({ id: project_id });
    const project = projects[0];
    
    if (!project) {
      return Response.json({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      }, { status: 404 });
    }
    
    const isForwardModel = project.financial_model_version === 'forward';
    
    // Fetch all required data in parallel
    const [commitments, invoiceBatches, invoiceBatchLines] = await Promise.all([
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.InvoiceBatch.filter({ project_id }),
      base44.entities.InvoiceBatchLine.filter({ project_id }),
    ]);
    
    // Also fetch batches that lines may reference (for multi-project batches)
    const batchIds = new Set(invoiceBatchLines.map(l => l.batch_id));
    let allBatches = [...invoiceBatches];
    
    // Add any batches from lines that aren't already in our list
    if (batchIds.size > 0) {
      const allBatchesList = await base44.entities.InvoiceBatch.filter({});
      for (const batch of allBatchesList) {
        if (batchIds.has(batch.id) && !allBatches.find(b => b.id === batch.id)) {
          allBatches.push(batch);
        }
      }
    }
    
    // Create batch lookup
    const batchesMap = Object.fromEntries(allBatches.map(b => [b.id, b]));
    
    // Filter active commitments (not cancelled/archived)
    const activeCommitments = commitments.filter(c => 
      !['cancelled', 'closed'].includes(c.commitment_status) && !c.is_archived
    );
    
    // ========================================
    // FORWARD MODEL: Revenue from InvoiceBatch only
    // ========================================
    if (isForwardModel) {
      // 1. Total Billable = SUM of commitment retail estimates
      // Use unit_retail_snapshot * qty_committed (the planned retail)
      const totalBillable = activeCommitments.reduce((sum, c) => {
        // Use planned_retail_total if available, otherwise compute
        const retail = c.planned_retail_total ?? ((c.unit_retail_snapshot ?? 0) * (c.qty_committed ?? 0));
        return sum + retail;
      }, 0);
      
      // 2. Build commitment-to-invoice mapping via InvoiceBatchLine
      const commitmentInvoiceMap = new Map(); // commitment_id -> { invoiced: bool, paid: bool, amount: number }
      
      for (const line of invoiceBatchLines) {
        if (!line.commitment_id) continue;
        
        const batch = batchesMap[line.batch_id];
        if (!batch || batch.status === 'voided') continue;
        
        const lineTotal = line.line_total ?? ((line.qty ?? 1) * (line.unit_price ?? 0));
        
        if (!commitmentInvoiceMap.has(line.commitment_id)) {
          commitmentInvoiceMap.set(line.commitment_id, {
            invoiced: false,
            paid: false,
            invoiced_amount: 0,
            paid_amount: 0,
          });
        }
        
        const entry = commitmentInvoiceMap.get(line.commitment_id);
        
        // Invoiced statuses: sent, exported, invoiced, paid
        if (['sent', 'exported', 'invoiced', 'paid'].includes(batch.status)) {
          entry.invoiced = true;
          entry.invoiced_amount += lineTotal;
        }
        
        // Paid status
        if (batch.status === 'paid') {
          entry.paid = true;
          entry.paid_amount += lineTotal;
        }
      }
      
      // 3. Calculate totals from invoice batches for this project
      // Sum by batch status (not by line, to avoid double-counting)
      let totalInvoiced = 0;
      let totalCollected = 0;
      
      // For accurate totals, sum line totals grouped by batch status
      const processedBatches = new Set();
      
      for (const line of invoiceBatchLines) {
        const batch = batchesMap[line.batch_id];
        if (!batch || batch.status === 'voided' || batch.status === 'draft') continue;
        
        const lineTotal = line.line_total ?? ((line.qty ?? 1) * (line.unit_price ?? 0));
        
        // Invoiced = sent, exported, invoiced, paid
        if (['sent', 'exported', 'invoiced', 'paid'].includes(batch.status)) {
          totalInvoiced += lineTotal;
        }
        
        // Collected = paid only
        if (batch.status === 'paid') {
          totalCollected += lineTotal;
        }
      }
      
      // 4. Commitment-level status summary
      const commitmentStatusSummary = activeCommitments.map(c => {
        const invoiceData = commitmentInvoiceMap.get(c.id);
        let revenueStatus = 'uninvoiced';
        
        if (invoiceData) {
          if (invoiceData.paid) {
            revenueStatus = 'paid';
          } else if (invoiceData.invoiced) {
            revenueStatus = 'invoiced';
          }
        }
        
        return {
          commitment_id: c.id,
          part_id: c.part_id,
          qty_committed: c.qty_committed ?? 0,
          planned_retail: c.planned_retail_total ?? ((c.unit_retail_snapshot ?? 0) * (c.qty_committed ?? 0)),
          revenue_status: revenueStatus,
          invoiced_amount: invoiceData?.invoiced_amount ?? 0,
          paid_amount: invoiceData?.paid_amount ?? 0,
        };
      });
      
      // 5. Count by status
      const uninvoicedCount = commitmentStatusSummary.filter(c => c.revenue_status === 'uninvoiced').length;
      const invoicedCount = commitmentStatusSummary.filter(c => c.revenue_status === 'invoiced').length;
      const paidCount = commitmentStatusSummary.filter(c => c.revenue_status === 'paid').length;
      
      return Response.json({
        success: true,
        financial_model: 'forward',
        project_id,
        project_name: project.name,
        
        // Revenue totals
        total_billable: totalBillable,
        total_invoiced: totalInvoiced,
        total_collected: totalCollected,
        remaining_to_invoice: Math.max(0, totalBillable - totalInvoiced),
        outstanding_receivable: totalInvoiced - totalCollected,
        
        // Commitment counts
        commitment_count: activeCommitments.length,
        uninvoiced_count: uninvoicedCount,
        invoiced_count: invoicedCount,
        paid_count: paidCount,
        
        // Coverage percentage
        invoice_coverage_pct: totalBillable > 0 ? ((totalInvoiced / totalBillable) * 100) : 0,
        collection_rate_pct: totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100) : 0,
        
        // Commitment details (optional, for detailed views)
        commitments: commitmentStatusSummary,
        
        // Invoice batches summary
        invoice_batches: allBatches.filter(b => b.status !== 'voided').map(b => ({
          id: b.id,
          batch_name: b.batch_name,
          invoice_number: b.invoice_number || b.qb_invoice_number,
          status: b.status,
          total_amount: b.total_amount ?? 0,
          invoice_date: b.invoice_date,
          payment_received_at: b.payment_received_at,
        })),
      });
    }
    
    // ========================================
    // LEGACY MODEL: Return legacy fields (read-only display)
    // ========================================
    return Response.json({
      success: true,
      financial_model: 'legacy',
      project_id,
      project_name: project.name,
      message: 'Legacy financial model - use existing pool-based calculations',
      
      // Return raw commitment data for legacy display
      total_planned_retail: activeCommitments.reduce((sum, c) => sum + (c.planned_retail_total ?? 0), 0),
      total_covered_retail: activeCommitments.reduce((sum, c) => sum + (c.covered_retail_total ?? 0), 0),
      total_exposure_gap: activeCommitments.reduce((sum, c) => sum + Math.max(0, c.exposure_gap ?? 0), 0),
      commitment_count: activeCommitments.length,
      
      // Legacy note
      _legacy_note: 'For legacy projects, continue using pool-based UI components.',
    });
    
  } catch (error) {
    console.error("getProjectRevenueSummary error:", error);
    return Response.json({ 
      error: error.message,
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
});