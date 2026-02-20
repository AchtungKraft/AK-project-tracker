import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * deleteLegacyInvoice - Phase 9D-A Admin Tool
 * 
 * Permanently deletes legacy manual invoice drafts.
 * This is a ONE-TIME cleanup function for removing:
 * - INV-MANUAL-* prefix invoices
 * - Any draft invoice not properly linked to commitments
 * 
 * HARD DELETE - No soft delete, no recovery.
 */

Deno.serve(async (req) => {
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

    const { invoice_number, dry_run = true } = await req.json();

    // ================================================================
    // MODE 1: Delete specific invoice by number
    // ================================================================
    if (invoice_number) {
      const invoices = await base44.asServiceRole.entities.InvoiceBatch.filter({
        invoice_number
      });

      if (invoices.length === 0) {
        // Try batch_name as fallback
        const byName = await base44.asServiceRole.entities.InvoiceBatch.filter({
          batch_name: invoice_number
        });
        
        if (byName.length === 0) {
          return Response.json({
            success: false,
            message: `Invoice not found: ${invoice_number}`,
            searched_fields: ['invoice_number', 'batch_name']
          });
        }
        
        invoices.push(...byName);
      }

      const invoice = invoices[0];

      // Only allow deletion of DRAFT status
      if (invoice.status !== 'draft') {
        return Response.json({
          success: false,
          error: `Cannot delete non-draft invoice. Status: ${invoice.status}`,
          invoice_id: invoice.id,
          suggestion: invoice.status === 'sent' || invoice.status === 'paid' 
            ? 'Use voidInvoiceBatch instead for sent/paid invoices'
            : null
        }, { status: 400 });
      }

      // Check for attached commitments
      const attachedLines = await base44.asServiceRole.entities.InvoiceBatchLine.filter({
        batch_id: invoice.id
      });

      if (dry_run) {
        return Response.json({
          success: true,
          dry_run: true,
          would_delete: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number || invoice.batch_name,
            status: invoice.status,
            total_amount: invoice.total_amount,
            line_count: attachedLines.length
          },
          attached_lines: attachedLines.map(l => ({
            id: l.id,
            commitment_id: l.commitment_id,
            part_id: l.part_id,
            line_total: l.line_total
          })),
          action_required: attachedLines.length > 0 
            ? 'Will unlink commitments before deletion'
            : 'No commitments attached'
        });
      }

      // EXECUTE DELETION
      // Step 1: Unlink commitments (set invoice_batch_id = null)
      for (const line of attachedLines) {
        if (line.commitment_id) {
          await base44.asServiceRole.entities.PartCommitment.update(line.commitment_id, {
            invoice_batch_id: null,
            billing_status: 'billable'  // Reset to unbilled
          });
        }
      }

      // Step 2: Delete all lines
      for (const line of attachedLines) {
        await base44.asServiceRole.entities.InvoiceBatchLine.delete(line.id);
      }

      // Step 3: Delete invoice batch
      await base44.asServiceRole.entities.InvoiceBatch.delete(invoice.id);

      return Response.json({
        success: true,
        deleted: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number || invoice.batch_name,
          lines_deleted: attachedLines.length,
          commitments_unlinked: attachedLines.filter(l => l.commitment_id).length
        },
        message: `Permanently deleted ${invoice.invoice_number || invoice.batch_name}`
      });
    }

    // ================================================================
    // MODE 2: Find all legacy manual invoices
    // ================================================================
    const allBatches = await base44.asServiceRole.entities.InvoiceBatch.list();
    
    const legacyInvoices = allBatches.filter(b => 
      (b.invoice_number && b.invoice_number.startsWith('INV-MANUAL-')) ||
      (b.batch_name && b.batch_name.startsWith('INV-MANUAL-'))
    );

    const draftLegacy = legacyInvoices.filter(b => b.status === 'draft');
    const nonDraftLegacy = legacyInvoices.filter(b => b.status !== 'draft');

    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        legacy_invoice_scan: {
          total_found: legacyInvoices.length,
          draft_count: draftLegacy.length,
          non_draft_count: nonDraftLegacy.length,
          can_delete: draftLegacy.map(b => ({
            id: b.id,
            invoice_number: b.invoice_number || b.batch_name,
            status: b.status,
            total_amount: b.total_amount
          })),
          requires_migration: nonDraftLegacy.map(b => ({
            id: b.id,
            invoice_number: b.invoice_number || b.batch_name,
            status: b.status,
            total_amount: b.total_amount,
            action: 'Archive or migrate to proper numbering'
          }))
        }
      });
    }

    // Batch delete all draft legacy invoices
    const deleted = [];
    for (const invoice of draftLegacy) {
      const lines = await base44.asServiceRole.entities.InvoiceBatchLine.filter({
        batch_id: invoice.id
      });

      // Unlink commitments
      for (const line of lines) {
        if (line.commitment_id) {
          await base44.asServiceRole.entities.PartCommitment.update(line.commitment_id, {
            invoice_batch_id: null,
            billing_status: 'billable'
          });
        }
        await base44.asServiceRole.entities.InvoiceBatchLine.delete(line.id);
      }

      await base44.asServiceRole.entities.InvoiceBatch.delete(invoice.id);
      deleted.push(invoice.invoice_number || invoice.batch_name);
    }

    return Response.json({
      success: true,
      deleted_count: deleted.length,
      deleted_invoices: deleted,
      skipped_non_draft: nonDraftLegacy.length,
      message: `Deleted ${deleted.length} legacy draft invoice(s)`
    });

  } catch (error) {
    console.error('deleteLegacyInvoice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});