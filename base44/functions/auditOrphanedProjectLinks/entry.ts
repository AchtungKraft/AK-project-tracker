import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * auditOrphanedProjectLinks - Detect orphaned project-part relationships
 * 
 * Identifies parts that appear linked to a project through legacy fields
 * but don't have a valid PartCommitment record.
 * 
 * PHASE 1: Audit
 * PHASE 2: Repair (optional)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { project_id, repair = false } = await req.json();
    
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Fetch all data needed for audit
    const [
      project,
      commitments,
      poLineItems,
      invoiceLines,
      projectInvoices,
    ] = await Promise.all([
      base44.entities.Project.filter({ id: project_id }).then(r => r[0]),
      base44.entities.PartCommitment.filter({ project_id }),
      base44.entities.PartPurchaseLineItem.filter({ project_id }),
      base44.entities.ProjectInvoiceLine.list('-created_date', 500),
      base44.entities.ProjectInvoice.filter({ project_id }),
    ]);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Build commitment lookup by part_id
    const commitmentByPartId = new Map();
    for (const c of commitments) {
      if (!commitmentByPartId.has(c.part_id)) {
        commitmentByPartId.set(c.part_id, []);
      }
      commitmentByPartId.get(c.part_id).push(c);
    }

    // Filter invoice lines to this project's invoices
    const projectInvoiceIds = new Set(projectInvoices.map(i => i.id));
    const projectInvoiceLines = invoiceLines.filter(il => projectInvoiceIds.has(il.invoice_id));

    const orphans = [];
    const repairActions = [];

    // ============================================================================
    // CHECK 1: PO Line Items without commitment
    // ============================================================================
    for (const lineItem of poLineItems) {
      if (!lineItem.commitment_id) {
        const hasCommitment = commitmentByPartId.has(lineItem.part_id);
        const possibleCommitments = commitmentByPartId.get(lineItem.part_id) || [];
        
        orphans.push({
          type: 'PO_LINE_ITEM',
          id: lineItem.id,
          part_id: lineItem.part_id,
          order_id: lineItem.order_id,
          has_commitment: hasCommitment,
          possible_commitments: possibleCommitments.map(c => c.id),
          qty_ordered: lineItem.qty_ordered,
          qty_received: lineItem.qty_received,
          orphan_source: 'po_line_no_commitment_id',
        });

        if (repair && possibleCommitments.length === 1) {
          // Auto-attach to single matching commitment
          repairActions.push({
            action: 'ATTACH_PO_LINE_TO_COMMITMENT',
            lineItemId: lineItem.id,
            commitmentId: possibleCommitments[0].id,
          });
        }
      }
    }

    // ============================================================================
    // CHECK 2: Invoice Lines without commitment reference
    // ============================================================================
    for (const invoiceLine of projectInvoiceLines) {
      if (!invoiceLine.commitment_id) {
        const hasCommitment = commitmentByPartId.has(invoiceLine.part_id);
        const possibleCommitments = commitmentByPartId.get(invoiceLine.part_id) || [];
        
        orphans.push({
          type: 'INVOICE_LINE',
          id: invoiceLine.id,
          part_id: invoiceLine.part_id,
          invoice_id: invoiceLine.invoice_id,
          has_commitment: hasCommitment,
          possible_commitments: possibleCommitments.map(c => c.id),
          qty: invoiceLine.qty,
          amount: invoiceLine.amount,
          orphan_source: 'invoice_line_no_commitment_id',
        });

        if (repair && possibleCommitments.length === 1) {
          repairActions.push({
            action: 'ATTACH_INVOICE_LINE_TO_COMMITMENT',
            invoiceLineId: invoiceLine.id,
            commitmentId: possibleCommitments[0].id,
          });
        }
      }
    }

    // ============================================================================
    // CHECK 3: Commitments with missing parts (reverse orphan)
    // ============================================================================
    const partIds = [...new Set(commitments.map(c => c.part_id))];
    const parts = partIds.length > 0 
      ? await base44.entities.Part.filter({ id: { $in: partIds } })
      : [];
    const partMap = new Map(parts.map(p => [p.id, p]));

    for (const commitment of commitments) {
      if (!partMap.has(commitment.part_id)) {
        orphans.push({
          type: 'COMMITMENT_MISSING_PART',
          id: commitment.id,
          part_id: commitment.part_id,
          has_commitment: true,
          possible_commitments: [],
          orphan_source: 'commitment_references_deleted_part',
        });
      }
    }

    // ============================================================================
    // EXECUTE REPAIRS (if requested)
    // ============================================================================
    const repairResults = [];
    if (repair && repairActions.length > 0) {
      for (const action of repairActions) {
        try {
          if (action.action === 'ATTACH_PO_LINE_TO_COMMITMENT') {
            await base44.entities.PartPurchaseLineItem.update(action.lineItemId, {
              commitment_id: action.commitmentId,
            });
            repairResults.push({ ...action, status: 'SUCCESS' });
          } else if (action.action === 'ATTACH_INVOICE_LINE_TO_COMMITMENT') {
            await base44.entities.ProjectInvoiceLine.update(action.invoiceLineId, {
              commitment_id: action.commitmentId,
            });
            repairResults.push({ ...action, status: 'SUCCESS' });
          }
        } catch (err) {
          repairResults.push({ ...action, status: 'FAILED', error: err.message });
        }
      }
    }

    // ============================================================================
    // SUMMARY
    // ============================================================================
    const summary = {
      project_id,
      project_name: project.name,
      total_commitments: commitments.length,
      total_po_line_items: poLineItems.length,
      total_invoice_lines: projectInvoiceLines.length,
      orphan_count: orphans.length,
      orphans_by_type: {
        PO_LINE_ITEM: orphans.filter(o => o.type === 'PO_LINE_ITEM').length,
        INVOICE_LINE: orphans.filter(o => o.type === 'INVOICE_LINE').length,
        COMMITMENT_MISSING_PART: orphans.filter(o => o.type === 'COMMITMENT_MISSING_PART').length,
      },
      repair_requested: repair,
      repairs_executed: repairResults.length,
      repairs_successful: repairResults.filter(r => r.status === 'SUCCESS').length,
    };

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      orphans,
      repair_results: repair ? repairResults : undefined,
    });

  } catch (error) {
    console.error("auditOrphanedProjectLinks error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});