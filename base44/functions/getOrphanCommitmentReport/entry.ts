import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * getOrphanCommitmentReport - Build actionable report of orphaned commitments
 * 
 * For each orphan (commitment with missing part), returns:
 * - Identifiers that can help match/recover
 * - Linked entities (line items, installed parts, inventory)
 * - Recommended resolution with confidence score
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
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();

    // Fetch all commitments (including cancelled to see full picture)
    const commitmentFilter = project_id ? { project_id } : {};
    const commitments = await base44.entities.PartCommitment.filter(commitmentFilter);

    // Fetch all parts to identify orphans
    const allParts = await base44.entities.Part.filter({});
    const partIdSet = new Set(allParts.map(p => p.id));
    const partMap = new Map(allParts.map(p => [p.id, p]));

    // Build lookup by vendor_part_number and normalized name
    const partByVPN = new Map();
    const partByNormalizedName = new Map();
    for (const p of allParts) {
      if (p.vendor_part_number) {
        partByVPN.set(p.vendor_part_number.toLowerCase().trim(), p);
      }
      if (p.part_name) {
        const normalized = p.part_name.toLowerCase().trim().replace(/\s+/g, ' ');
        if (!partByNormalizedName.has(normalized)) {
          partByNormalizedName.set(normalized, p);
        }
      }
    }

    // Find orphans
    const orphans = commitments.filter(c => c.part_id && !partIdSet.has(c.part_id));

    if (orphans.length === 0) {
      return Response.json({
        success: true,
        orphan_count: 0,
        message: 'No orphaned commitments found',
        orphans: []
      });
    }

    // Fetch related entities
    const orphanIds = orphans.map(o => o.id);
    const orphanPartIds = orphans.map(o => o.part_id);

    // Line items linked to orphan commitments
    const lineItems = await base44.entities.PartPurchaseLineItem.filter({
      commitment_id: { $in: orphanIds }
    });

    // Also check line items by part_id (might not have commitment link)
    const lineItemsByPart = await base44.entities.PartPurchaseLineItem.filter({
      part_id: { $in: orphanPartIds }
    });

    // Installed parts
    const installedParts = await base44.entities.InstalledPart.filter({
      commitment_id: { $in: orphanIds }
    });

    // Fetch orders for line items
    const orderIds = [...new Set([...lineItems, ...lineItemsByPart].map(li => li.order_id).filter(Boolean))];
    const orders = orderIds.length > 0 
      ? await base44.entities.Order.filter({ id: { $in: orderIds } })
      : [];
    const orderMap = new Map(orders.map(o => [o.id, o]));

    // Fetch vendors
    const vendorIds = [...new Set([...lineItems, ...lineItemsByPart].map(li => li.vendor_id).filter(Boolean))];
    const vendors = vendorIds.length > 0
      ? await base44.entities.Vendor.filter({ id: { $in: vendorIds } })
      : [];
    const vendorMap = new Map(vendors.map(v => [v.id, v]));

    // Fetch projects
    const projectIds = [...new Set(orphans.map(o => o.project_id).filter(Boolean))];
    const projects = projectIds.length > 0
      ? await base44.entities.Project.filter({ id: { $in: projectIds } })
      : [];
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Build orphan report
    const orphanReport = [];

    for (const orphan of orphans) {
      // Get linked line items
      const commitmentLineItems = lineItems.filter(li => li.commitment_id === orphan.id);
      const partLineItems = lineItemsByPart.filter(li => li.part_id === orphan.part_id);
      const allLineItems = [...commitmentLineItems, ...partLineItems.filter(li => !commitmentLineItems.find(cli => cli.id === li.id))];

      // Get installed parts
      const commitmentInstalls = installedParts.filter(ip => ip.commitment_id === orphan.id);

      // Extract identifiers from commitment and line items
      const identifiers = {
        part_id_missing: orphan.part_id,
        notes: orphan.notes,
        // Look for any stored snapshots
        unit_cost_snapshot: orphan.unit_cost_snapshot,
        unit_retail_snapshot: orphan.unit_retail_snapshot
      };

      // Try to find vendor_part_number from line items
      let vendor_part_number = null;
      let vendor_id = null;
      let vendor_name = null;
      let po_numbers = [];

      for (const li of allLineItems) {
        if (li.vendor_id) {
          vendor_id = li.vendor_id;
          vendor_name = vendorMap.get(li.vendor_id)?.vendor_name;
        }
        if (li.order_id) {
          const order = orderMap.get(li.order_id);
          if (order?.po_number) {
            po_numbers.push(order.po_number);
          }
        }
      }

      // Determine recommended resolution
      let recommended_resolution = 'QUARANTINE';
      let confidence = 0;
      let match_candidate = null;
      let match_reason = null;

      // Check if this looks like a test record
      const isTestLike = 
        (orphan.notes && /test/i.test(orphan.notes)) ||
        (orphan.commitment_status === 'planned' && 
         !allLineItems.length && 
         !commitmentInstalls.length &&
         (orphan.required_total ?? orphan.qty_committed ?? 0) === 0);

      if (isTestLike && orphan.commitment_status !== 'cancelled') {
        recommended_resolution = 'CANCEL';
        confidence = 85;
        match_reason = 'Appears to be test/placeholder with no history';
      } else if (vendor_part_number) {
        // Try to match by VPN
        const matchByVPN = partByVPN.get(vendor_part_number.toLowerCase().trim());
        if (matchByVPN) {
          recommended_resolution = 'REPLACE';
          confidence = 95;
          match_candidate = matchByVPN.id;
          match_reason = `Exact VPN match: ${matchByVPN.part_name}`;
        }
      }

      // If no match yet and has line items/installs, prefer REATTACH
      if (recommended_resolution === 'QUARANTINE') {
        if (allLineItems.length > 0 || commitmentInstalls.length > 0) {
          recommended_resolution = 'REATTACH';
          confidence = 60;
          match_reason = 'Has purchase/install history - needs recovered part';
        } else if (orphan.commitment_status === 'planned') {
          recommended_resolution = 'CANCEL';
          confidence = 70;
          match_reason = 'No history, planned status - safe to cancel';
        }
      }

      // Build report entry
      orphanReport.push({
        commitment_id: orphan.id,
        project_id: orphan.project_id,
        project_name: projectMap.get(orphan.project_id)?.name || 'Unknown',
        commitment_status: orphan.commitment_status,
        billing_status: orphan.billing_status,
        
        // Quantities
        required_total: orphan.required_total ?? orphan.qty_committed ?? 0,
        reserved_from_stock: orphan.reserved_from_stock ?? orphan.qty_reserved ?? 0,
        qty_installed: orphan.qty_installed ?? 0,
        
        // Identifiers
        missing_part_id: orphan.part_id,
        identifiers,
        vendor_part_number,
        vendor_id,
        vendor_name,
        
        // Linked entities
        line_items_count: allLineItems.length,
        po_numbers: [...new Set(po_numbers)],
        installed_parts_count: commitmentInstalls.length,
        install_dates: commitmentInstalls.map(ip => ip.installed_date).filter(Boolean),
        
        // Resolution
        recommended_resolution,
        confidence,
        match_candidate,
        match_reason,
        
        // Flags
        has_financial_history: allLineItems.length > 0 || orphan.billing_status !== 'billable',
        has_install_history: commitmentInstalls.length > 0,
        is_test_like: isTestLike
      });
    }

    // Group by project
    const byProject = {};
    for (const o of orphanReport) {
      if (!byProject[o.project_id]) {
        byProject[o.project_id] = {
          project_id: o.project_id,
          project_name: o.project_name,
          orphans: []
        };
      }
      byProject[o.project_id].orphans.push(o);
    }

    // Group by vendor
    const byVendor = {};
    for (const o of orphanReport) {
      const vKey = o.vendor_id || 'no_vendor';
      if (!byVendor[vKey]) {
        byVendor[vKey] = {
          vendor_id: o.vendor_id,
          vendor_name: o.vendor_name || 'No Vendor',
          orphans: []
        };
      }
      byVendor[vKey].orphans.push(o);
    }

    // Summary
    const summary = {
      total_orphans: orphanReport.length,
      by_resolution: {
        REPLACE: orphanReport.filter(o => o.recommended_resolution === 'REPLACE').length,
        REATTACH: orphanReport.filter(o => o.recommended_resolution === 'REATTACH').length,
        CANCEL: orphanReport.filter(o => o.recommended_resolution === 'CANCEL').length,
        QUARANTINE: orphanReport.filter(o => o.recommended_resolution === 'QUARANTINE').length
      },
      high_confidence_count: orphanReport.filter(o => o.confidence >= 90).length,
      with_line_items: orphanReport.filter(o => o.line_items_count > 0).length,
      with_installs: orphanReport.filter(o => o.installed_parts_count > 0).length
    };

    return Response.json({
      success: true,
      orphan_count: orphanReport.length,
      summary,
      orphans: orphanReport,
      by_project: Object.values(byProject),
      by_vendor: Object.values(byVendor)
    });

  } catch (error) {
    console.error("getOrphanCommitmentReport error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});