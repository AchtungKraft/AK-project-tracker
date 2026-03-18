import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * runSupplyIntegrityAudit - Pre-Migration Integrity Checker
 * 
 * Validates the entire supply system for invariant violations before migration.
 * 
 * Checks:
 * - reserved_from_stock > physical_stock
 * - qty_installed > required_total
 * - allocated_stock != SUM(reserved_from_stock)
 * - on_order != SUM(open PO lines)
 * - Orphaned commitments (no project)
 * - Orphaned line items (no commitment)
 * - Negative quantities
 * 
 * Returns structured drift report WITHOUT auto-fixing.
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

    // Only admins can run audit
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { project_id, part_id, include_cancelled = false } = await req.json();

    const issues = [];
    const summary = {
      parts_audited: 0,
      commitments_audited: 0,
      line_items_audited: 0,
      total_issues: 0,
      critical_issues: 0,
      warning_issues: 0
    };

    // Fetch all relevant data
    const partsFilter = part_id ? { id: part_id } : {};
    const parts = await base44.entities.Part.filter(partsFilter);
    summary.parts_audited = parts.length;

    const commitmentFilter = { 
      ...(project_id && { project_id }),
      ...(part_id && { part_id }),
      ...(!include_cancelled && { commitment_status: { $ne: 'cancelled' } })
    };
    const commitments = await base44.entities.PartCommitment.filter(commitmentFilter);
    summary.commitments_audited = commitments.length;

    const lineItemFilter = {
      ...(part_id && { part_id }),
      status: { $in: ['Ordered', 'Partial'] }
    };
    const lineItems = await base44.entities.PartPurchaseLineItem.filter(lineItemFilter);
    summary.line_items_audited = lineItems.length;

    // Build lookup maps
    const partMap = new Map(parts.map(p => [p.id, p]));
    const commitmentsByPart = new Map();
    const lineItemsByPart = new Map();

    for (const c of commitments) {
      if (!commitmentsByPart.has(c.part_id)) {
        commitmentsByPart.set(c.part_id, []);
      }
      commitmentsByPart.get(c.part_id).push(c);
    }

    for (const li of lineItems) {
      if (!lineItemsByPart.has(li.part_id)) {
        lineItemsByPart.set(li.part_id, []);
      }
      lineItemsByPart.get(li.part_id).push(li);
    }

    // ============================================
    // PART-LEVEL AUDITS
    // ============================================
    for (const part of parts) {
      const partCommitments = commitmentsByPart.get(part.id) || [];
      const partLineItems = lineItemsByPart.get(part.id) || [];
      const physical_stock = part.physical_stock ?? 0;

      // Compute expected allocated_stock
      const computed_allocated = partCommitments.reduce((sum, c) => {
        return sum + (c.reserved_from_stock ?? c.qty_reserved ?? 0);
      }, 0);

      // Compute expected on_order
      const computed_on_order = partLineItems.reduce((sum, li) => {
        const ordered = li.qty_ordered ?? 0;
        const received = li.qty_received ?? 0;
        return sum + Math.max(0, ordered - received);
      }, 0);

      // Check: allocated_stock drift
      const stored_allocated = part.allocated_stock ?? 0;
      if (stored_allocated !== computed_allocated) {
        issues.push({
          type: 'ALLOCATED_STOCK_DRIFT',
          severity: 'warning',
          entity_type: 'Part',
          entity_id: part.id,
          part_name: part.part_name,
          stored_value: stored_allocated,
          computed_value: computed_allocated,
          delta: computed_allocated - stored_allocated
        });
      }

      // Check: on_order drift
      const stored_on_order = part.on_order ?? 0;
      if (stored_on_order !== computed_on_order) {
        issues.push({
          type: 'ON_ORDER_DRIFT',
          severity: 'warning',
          entity_type: 'Part',
          entity_id: part.id,
          part_name: part.part_name,
          stored_value: stored_on_order,
          computed_value: computed_on_order,
          delta: computed_on_order - stored_on_order
        });
      }

      // Check: allocated exceeds physical
      if (computed_allocated > physical_stock) {
        issues.push({
          type: 'ALLOCATED_EXCEEDS_PHYSICAL',
          severity: 'critical',
          entity_type: 'Part',
          entity_id: part.id,
          part_name: part.part_name,
          physical_stock,
          allocated_stock: computed_allocated,
          overage: computed_allocated - physical_stock
        });
      }

      // Check: negative physical stock
      if (physical_stock < 0) {
        issues.push({
          type: 'NEGATIVE_PHYSICAL_STOCK',
          severity: 'critical',
          entity_type: 'Part',
          entity_id: part.id,
          part_name: part.part_name,
          physical_stock
        });
      }
    }

    // ============================================
    // COMMITMENT-LEVEL AUDITS
    // ============================================
    for (const commitment of commitments) {
      const part = partMap.get(commitment.part_id);
      const required = commitment.required_total ?? commitment.qty_committed ?? 0;
      const reserved = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
      const covered_po = commitment.covered_from_po ?? 0;
      const installed = commitment.qty_installed ?? 0;

      // Check: installed exceeds required
      if (installed > required && required > 0) {
        issues.push({
          type: 'INSTALLED_EXCEEDS_REQUIRED',
          severity: 'critical',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          required_total: required,
          qty_installed: installed,
          overage: installed - required
        });
      }

      // Check: reserved exceeds required
      if (reserved > required && required > 0) {
        issues.push({
          type: 'RESERVED_EXCEEDS_REQUIRED',
          severity: 'warning',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          required_total: required,
          reserved_from_stock: reserved,
          overage: reserved - required
        });
      }

      // Check: LEGACY POISON PILL - reserved with ZERO required
      // This is a critical issue because it blocks AUTO_RESERVE by claiming
      // allocated stock that shouldn't be allocated
      if (reserved > 0 && required === 0 && installed === 0) {
        issues.push({
          type: 'RESERVED_WITH_ZERO_REQUIRED',
          severity: 'critical',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          required_total: required,
          reserved_from_stock: reserved,
          qty_installed: installed,
          has_orders: (commitment.order_line_item_ids || []).length > 0,
          fix: 'Run fixLegacyReservedZeroRequired to release blocked stock'
        });
      }

      // Check: negative quantities
      if (reserved < 0) {
        issues.push({
          type: 'NEGATIVE_RESERVED',
          severity: 'critical',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          reserved_from_stock: reserved
        });
      }

      if (covered_po < 0) {
        issues.push({
          type: 'NEGATIVE_COVERED_PO',
          severity: 'critical',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          covered_from_po: covered_po
        });
      }

      if (installed < 0) {
        issues.push({
          type: 'NEGATIVE_INSTALLED',
          severity: 'critical',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          qty_installed: installed
        });
      }

      // Check: orphaned commitment (no project)
      if (!commitment.project_id) {
        issues.push({
          type: 'ORPHANED_COMMITMENT',
          severity: 'warning',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          part_name: part?.part_name,
          reason: 'Missing project_id'
        });
      }

      // Check: orphaned commitment (no part)
      if (!part) {
        issues.push({
          type: 'ORPHANED_COMMITMENT',
          severity: 'critical',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          reason: 'Part not found',
          part_id: commitment.part_id
        });
      }

      // Check: legacy field inconsistency
      const legacy_committed = commitment.qty_committed ?? 0;
      const canonical_required = commitment.required_total ?? 0;
      if (canonical_required > 0 && legacy_committed > 0 && canonical_required !== legacy_committed) {
        issues.push({
          type: 'LEGACY_FIELD_MISMATCH',
          severity: 'warning',
          entity_type: 'PartCommitment',
          entity_id: commitment.id,
          project_id: commitment.project_id,
          part_name: part?.part_name,
          required_total: canonical_required,
          qty_committed: legacy_committed
        });
      }
    }

    // ============================================
    // LINE ITEM-LEVEL AUDITS
    // ============================================
    for (const lineItem of lineItems) {
      const part = partMap.get(lineItem.part_id);
      
      // Check: orphaned line item (no commitment link)
      if (!lineItem.commitment_id) {
        issues.push({
          type: 'ORPHANED_LINE_ITEM',
          severity: 'warning',
          entity_type: 'PartPurchaseLineItem',
          entity_id: lineItem.id,
          order_id: lineItem.order_id,
          part_name: part?.part_name,
          reason: 'Missing commitment_id'
        });
      }

      // Check: received exceeds ordered
      const ordered = lineItem.qty_ordered ?? 0;
      const received = lineItem.qty_received ?? 0;
      if (received > ordered) {
        issues.push({
          type: 'RECEIVED_EXCEEDS_ORDERED',
          severity: 'warning',
          entity_type: 'PartPurchaseLineItem',
          entity_id: lineItem.id,
          order_id: lineItem.order_id,
          part_name: part?.part_name,
          qty_ordered: ordered,
          qty_received: received,
          overage: received - ordered
        });
      }

      // Check: negative quantities
      if (ordered < 0 || received < 0) {
        issues.push({
          type: 'NEGATIVE_LINE_ITEM_QTY',
          severity: 'critical',
          entity_type: 'PartPurchaseLineItem',
          entity_id: lineItem.id,
          order_id: lineItem.order_id,
          part_name: part?.part_name,
          qty_ordered: ordered,
          qty_received: received
        });
      }
    }

    // ============================================
    // SUMMARIZE
    // ============================================
    summary.total_issues = issues.length;
    summary.critical_issues = issues.filter(i => i.severity === 'critical').length;
    summary.warning_issues = issues.filter(i => i.severity === 'warning').length;

    // Group by type
    const issuesByType = {};
    for (const issue of issues) {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    }

    return Response.json({
      success: true,
      audit_timestamp: new Date().toISOString(),
      summary,
      issues_by_type: issuesByType,
      all_issues: issues,
      migration_safe: summary.critical_issues === 0
    });

  } catch (error) {
    console.error("runSupplyIntegrityAudit error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});