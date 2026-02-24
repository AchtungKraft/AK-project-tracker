import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getProjectCreditAllocationPreview
 * 
 * Returns unified allocation targets (invoices + commitments) for manual credit allocation.
 * 
 * Response Contract:
 * {
 *   success: true,
 *   credit_available: number,
 *   targets: [
 *     {
 *       key: "invoice:<id>" | "commitment:<id>",
 *       target_type: "invoice" | "commitment",
 *       target_id: string,
 *       label_primary: string,
 *       label_secondary?: string,
 *       gross: number,
 *       outstanding: number,
 *       already_credited: number
 *     }
 *   ]
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
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { project_id } = payload;

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Fetch credit ledger entries
    const credits = await base44.entities.ProjectCreditLedger.filter({
      project_id,
    });

    const creditAvailable = credits.reduce((sum, c) => sum + (c.remaining_amount ?? 0), 0);

    // Fetch invoices with balance_due > 0
    const invoices = await base44.entities.ProjectInvoice.filter({
      project_id,
    });

    // Fetch commitments
    const commitments = await base44.entities.PartCommitment.filter({
      project_id,
    });

    // Fetch parts for labeling
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = partIds.length > 0 
      ? await base44.entities.Part.filter({})
      : [];
    const partMap = new Map(parts.map(p => [p.id, p]));

    // Fetch vendors and categories for secondary labels
    const vendors = await base44.entities.Vendor.filter({});
    const categories = await base44.entities.PartCategory.filter({});
    const vendorMap = new Map(vendors.map(v => [v.id, v]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const targets = [];

    // === INVOICE TARGETS ===
    // Include only invoices where balance_due > 0
    const eligibleInvoices = invoices
      .filter(inv => (inv.balance_due ?? 0) > 0 && inv.status !== 'cancelled' && inv.status !== 'paid')
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    for (const inv of eligibleInvoices) {
      const gross = inv.subtotal ?? inv.total ?? 0;
      const alreadyCredited = inv.credit_applied ?? 0;
      const outstanding = inv.balance_due ?? 0;

      targets.push({
        key: `invoice:${inv.id}`,
        target_type: 'invoice',
        target_id: inv.id,
        label_primary: inv.qb_invoice_number || `Invoice ${inv.id.slice(0, 8)}`,
        label_secondary: inv.invoice_type ? `${inv.invoice_type.charAt(0).toUpperCase()}${inv.invoice_type.slice(1)}` : null,
        gross,
        outstanding,
        already_credited: alreadyCredited,
      });
    }

    // === COMMITMENT TARGETS ===
    // Include only commitments with outstanding > 0
    // outstanding = planned_retail_total - invoiced_amount
    const eligibleCommitments = commitments
      .filter(c => {
        if (c.is_archived || c.cancelled_at) return false;
        const plannedRetail = c.planned_retail_total ?? ((c.unit_retail_snapshot ?? 0) * (c.required_total ?? 0));
        const invoicedAmount = c.invoiced_amount ?? 0;
        const outstanding = plannedRetail - invoicedAmount;
        return outstanding > 0;
      })
      .sort((a, b) => {
        // Sort by category alpha, then part name alpha
        const partA = partMap.get(a.part_id);
        const partB = partMap.get(b.part_id);
        const catA = partA?.part_category_id ? categoryMap.get(partA.part_category_id)?.name || '' : '';
        const catB = partB?.part_category_id ? categoryMap.get(partB.part_category_id)?.name || '' : '';
        if (catA !== catB) return catA.localeCompare(catB);
        const nameA = partA?.part_name || '';
        const nameB = partB?.part_name || '';
        return nameA.localeCompare(nameB);
      });

    for (const c of eligibleCommitments) {
      const part = partMap.get(c.part_id);
      const vendor = part?.default_vendor_id ? vendorMap.get(part.default_vendor_id) : null;
      const category = part?.part_category_id ? categoryMap.get(part.part_category_id) : null;

      const plannedRetail = c.planned_retail_total ?? ((c.unit_retail_snapshot ?? 0) * (c.required_total ?? 0));
      const invoicedAmount = c.invoiced_amount ?? 0;
      const outstanding = plannedRetail - invoicedAmount;
      const alreadyCredited = c.covered_retail_total ?? 0;

      targets.push({
        key: `commitment:${c.id}`,
        target_type: 'commitment',
        target_id: c.id,
        label_primary: part?.part_name || `Commitment ${c.id.slice(0, 8)}`,
        label_secondary: [category?.name, vendor?.vendor_name].filter(Boolean).join(' • ') || null,
        gross: plannedRetail,
        outstanding,
        already_credited: alreadyCredited,
      });
    }

    return Response.json({
      success: true,
      credit_available: creditAvailable,
      targets,
    });

  } catch (error) {
    console.error('getProjectCreditAllocationPreview error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});