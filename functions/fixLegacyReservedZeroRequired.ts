import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * fixLegacyReservedZeroRequired - Cleanup legacy commitment poison
 * 
 * Fixes commitments where:
 * - required_total == 0 (or missing/undefined)
 * - reserved_from_stock > 0
 * - qty_installed == 0 (no actual work done)
 * - no order_line_item_ids (or no receiving/financial history)
 * 
 * These "poison pill" commitments block AUTO_RESERVE because they claim
 * allocated stock that shouldn't be allocated. This makes "available" lie.
 * 
 * Safe to auto-fix:
 * - No installations, no orders, no financial history
 * 
 * Needs manual review:
 * - Has installations (qty_installed > 0)
 * - Has orders (order_line_item_ids.length > 0)
 * - Has financial history (billing_status !== 'billable' or 'not_billable')
 * 
 * Returns:
 * - fixed[]: Commitments that were auto-fixed
 * - needs_review[]: Commitments that need manual attention
 * - summary: counts
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

    const { 
      dry_run = true, // Default to preview mode
      limit = 100,    // Limit per run
      project_id      // Optional: filter to specific project
    } = await req.json();

    const timestamp = new Date().toISOString();

    // Find all commitments with reserved_from_stock > 0
    const filter = {
      ...(project_id && { project_id }),
      commitment_status: { $ne: 'cancelled' }
    };
    
    const allCommitments = await base44.asServiceRole.entities.PartCommitment.filter(filter);
    
    // Filter to poison pill candidates: reserved > 0 but required = 0
    const candidates = allCommitments.filter(c => {
      const required = c.required_total ?? c.qty_committed ?? 0;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      
      // Poison pill: has reservation but no requirement
      return reserved > 0 && required === 0;
    });

    // Fetch related data for safety checks
    const partIds = [...new Set(candidates.map(c => c.part_id))];
    const projectIds = [...new Set(candidates.map(c => c.project_id).filter(Boolean))];
    
    const parts = partIds.length > 0 
      ? await base44.asServiceRole.entities.Part.filter({ id: { $in: partIds } })
      : [];
    const projects = projectIds.length > 0
      ? await base44.asServiceRole.entities.Project.filter({ id: { $in: projectIds } })
      : [];
    
    const partMap = new Map(parts.map(p => [p.id, p]));
    const projectMap = new Map(projects.map(p => [p.id, p]));

    const fixed = [];
    const needs_review = [];
    const errors = [];

    for (const c of candidates.slice(0, limit)) {
      const part = partMap.get(c.part_id);
      const project = projectMap.get(c.project_id);
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const installed = c.qty_installed ?? 0;
      const orderLineIds = c.order_line_item_ids || [];
      const billingStatus = c.billing_status || 'billable';

      const record = {
        commitment_id: c.id,
        project_id: c.project_id,
        project_name: project?.name || 'Unknown',
        part_id: c.part_id,
        part_name: part?.part_name || 'Unknown',
        reserved_from_stock: reserved,
        required_total: c.required_total ?? 0,
        qty_installed: installed,
        order_line_item_ids: orderLineIds,
        billing_status: billingStatus,
        created_date: c.created_date
      };

      // Safety checks
      const hasInstallations = installed > 0;
      const hasOrders = orderLineIds.length > 0;
      const hasFinancialHistory = !['billable', 'not_billable'].includes(billingStatus);

      if (hasInstallations || hasOrders || hasFinancialHistory) {
        needs_review.push({
          ...record,
          reason: [
            hasInstallations && 'has_installations',
            hasOrders && 'has_orders',
            hasFinancialHistory && 'has_financial_history'
          ].filter(Boolean).join(', ')
        });
        continue;
      }

      // Safe to auto-fix
      if (!dry_run) {
        try {
          // Release the reservation
          await base44.asServiceRole.entities.PartCommitment.update(c.id, {
            reserved_from_stock: 0,
            qty_reserved: 0, // Legacy field sync
            qty_to_order: 0, // No requirement = no order needed
            coverage_status: 'NOT_COVERED',
            legacy_cleanup_tag: 'reserved_zero_required',
            legacy_cleanup_at: timestamp,
            legacy_cleanup_by: user.email,
            state_version: (c.state_version ?? 0) + 1
          });

          // Create audit log
          await base44.asServiceRole.entities.LifecycleEvent.create({
            commitment_id: c.id,
            event_type: 'DRIFT_REPAIRED',
            trigger_source: 'SYSTEM_AUTOMATION',
            triggered_by: user.email,
            part_id: c.part_id,
            project_id: c.project_id,
            before_state: JSON.stringify({ reserved_from_stock: reserved, required_total: 0 }),
            after_state: JSON.stringify({ reserved_from_stock: 0, required_total: 0 }),
            notes: 'Legacy poison pill cleanup: reserved_from_stock with zero required_total',
            event_date: timestamp
          });

          fixed.push({ ...record, action: 'fixed' });
        } catch (error) {
          errors.push({ commitment_id: c.id, error: error.message });
        }
      } else {
        fixed.push({ ...record, action: 'would_fix (dry_run)' });
      }
    }

    const summary = {
      total_candidates: candidates.length,
      processed: Math.min(candidates.length, limit),
      auto_fixed: fixed.length,
      needs_review: needs_review.length,
      errors: errors.length,
      dry_run,
      timestamp
    };

    // Calculate total stock that would be released
    const stockToRelease = fixed.reduce((sum, f) => sum + f.reserved_from_stock, 0);

    return Response.json({
      success: true,
      summary,
      stock_to_release: stockToRelease,
      fixed,
      needs_review: needs_review.slice(0, 20), // Limit output
      errors,
      // Recommendation
      recommendation: dry_run && fixed.length > 0
        ? `Run again with dry_run=false to fix ${fixed.length} commitments and release ${stockToRelease} units of blocked stock`
        : null
    });

  } catch (error) {
    console.error('fixLegacyReservedZeroRequired error:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});