import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validateSupplyIntegrity - Phase 9H Step 8
 * 
 * Admin tool for comprehensive supply math validation.
 * 
 * Validates ALL invariants:
 * CHECK A - Billing Flag Integrity: requires_prepay must be explicit boolean
 * CHECK B - Inventory Drift: physical_stock >= SUM(reserved_from_stock)
 * CHECK C - Coverage Invariant: required_total = reserved + covered + to_order
 * 
 * Additional checks:
 * - Stock Non-Negative: physical_stock >= 0
 * - Reservation Non-Negative: reserved_from_stock >= 0
 * - Coverage Non-Negative: covered_from_po >= 0
 * - Installed <= Reserved + Received
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

    const { project_id, fix_mode = false, scan_all = false } = await req.json();

    // Fetch data
    const filter = project_id ? { project_id } : {};
    const [commitments, parts] = await Promise.all([
      scan_all ? base44.asServiceRole.entities.PartCommitment.list() : base44.asServiceRole.entities.PartCommitment.filter(filter),
      base44.asServiceRole.entities.Part.list(),
    ]);

    const partMap = new Map(parts.map(p => [p.id, p]));
    
    const violations = [];
    const warnings = [];
    let validCount = 0;

    // ================================================================
    // CHECK A: Billing Flag Integrity
    // ================================================================
    const billingViolations = [];
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') continue;
      
      if (typeof c.requires_prepay !== 'boolean') {
        billingViolations.push({
          commitment_id: c.id,
          project_id: c.project_id,
          part_id: c.part_id,
          requires_prepay_value: c.requires_prepay,
          requires_prepay_type: typeof c.requires_prepay
        });
      }
    }

    // ================================================================
    // CHECK B: Inventory Drift (per-part)
    // ================================================================
    const stockViolations = [];
    const partReservations = new Map();
    
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') continue;
      const partId = c.part_id;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      partReservations.set(partId, (partReservations.get(partId) || 0) + reserved);
    }

    for (const [partId, totalReserved] of partReservations) {
      const part = partMap.get(partId);
      const physical = part?.physical_stock ?? 0;
      if (totalReserved > physical + 0.001) {
        stockViolations.push({
          part_id: partId,
          part_name: part?.part_name || 'Unknown',
          physical_stock: physical,
          total_reserved: totalReserved,
          deficit: totalReserved - physical
        });
      }
    }

    // ================================================================
    // PHASE 13B: CHECK D - InventoryItem SUM vs Part.physical_stock
    // ================================================================
    const inventoryItems = await base44.asServiceRole.entities.InventoryItem.list();
    const locationSumViolations = [];
    
    const partLocationSums = new Map();
    inventoryItems.forEach(item => {
      const qty = item.quantity_on_hand ?? 0;
      partLocationSums.set(item.part_id, (partLocationSums.get(item.part_id) || 0) + qty);
    });
    
    for (const [partId, locationSum] of partLocationSums) {
      const part = partMap.get(partId);
      const physical = part?.physical_stock ?? 0;
      
      if (Math.abs(locationSum - physical) > 0.001) {
        locationSumViolations.push({
          part_id: partId,
          part_name: part?.part_name || 'Unknown',
          physical_stock: physical,
          location_sum: locationSum,
          diff: locationSum - physical
        });
        
        // Flag integrity warning on Part
        if (part && !dry_run) {
          await base44.asServiceRole.entities.Part.update(partId, {
            integrity_warning: true,
            integrity_warning_details: `Location sum (${locationSum}) != physical_stock (${physical})`
          });
        }
      }
    }

    // ================================================================
    // CHECK C: Coverage Invariant (per-commitment)
    // ================================================================
    const coverageViolations = [];

    for (const c of commitments) {
      if (c.commitment_status === 'cancelled' || c.commitment_status === 'closed') continue;

      const part = partMap.get(c.part_id);
      const required_total = c.required_total ?? c.qty_committed ?? 0;
      const reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
      const to_order = c.qty_to_order ?? Math.max(0, required_total - reserved_from_stock - covered_from_po);
      const qty_installed = c.qty_installed ?? 0;
      const qty_received = c.qty_received ?? 0;

      const commitmentErrors = [];

      // PHASE 12R-HARDENING: Coverage Invariant accounting for installed qty
      // remaining_required = required_total - qty_installed
      // remaining_required === reserved_from_stock + covered_from_po + qty_to_order
      const remaining_required = Math.max(0, required_total - qty_installed);
      const sum = reserved_from_stock + covered_from_po + to_order;
      
      if (Math.abs(sum - remaining_required) > 0.01) {
        commitmentErrors.push({
          code: 'COVERAGE_INVARIANT',
          message: `remaining_required(${remaining_required}) != reserved(${reserved_from_stock}) + covered(${covered_from_po}) + to_order(${to_order}) = ${sum}. (required=${required_total}, installed=${qty_installed})`,
          severity: 'CRITICAL'
        });
        coverageViolations.push({
          commitment_id: c.id,
          required_total,
          qty_installed,
          remaining_required,
          reserved_from_stock,
          covered_from_po,
          to_order,
          sum,
          diff: sum - remaining_required
        });
      }

      // Negative reserved
      if (reserved_from_stock < 0) {
        commitmentErrors.push({
          code: 'NEGATIVE_RESERVED',
          message: `reserved_from_stock = ${reserved_from_stock}`,
          severity: 'CRITICAL'
        });
      }

      // Negative covered
      if (covered_from_po < 0) {
        commitmentErrors.push({
          code: 'NEGATIVE_COVERED',
          message: `covered_from_po = ${covered_from_po}`,
          severity: 'CRITICAL'
        });
      }

      // Installed exceeds available
      const available_to_install = reserved_from_stock + qty_received;
      if (qty_installed > available_to_install + 0.01) {
        commitmentErrors.push({
          code: 'INSTALLED_EXCEEDS_AVAILABLE',
          message: `installed(${qty_installed}) > reserved(${reserved_from_stock}) + received(${qty_received}) = ${available_to_install}`,
          severity: 'WARNING'
        });
      }

      // Part physical stock check
      if (part && (part.physical_stock ?? 0) < 0) {
        commitmentErrors.push({
          code: 'NEGATIVE_PHYSICAL_STOCK',
          message: `Part ${part.part_name} has physical_stock = ${part.physical_stock}`,
          severity: 'CRITICAL'
        });
      }

      if (commitmentErrors.length > 0) {
        violations.push({
          commitment_id: c.id,
          project_id: c.project_id,
          part_id: c.part_id,
          part_name: part?.part_name || 'Unknown',
          fields: {
            required_total,
            reserved_from_stock,
            covered_from_po,
            to_order,
            qty_installed,
            qty_received,
            physical_stock: part?.physical_stock ?? 0
          },
          errors: commitmentErrors
        });
      } else {
        validCount++;
      }
    }

    // Add stock violations to warnings
    for (const sv of stockViolations) {
      warnings.push({
        code: 'OVER_RESERVED',
        ...sv,
        severity: 'WARNING'
      });
    }

    const hasCritical = violations.some(v => v.errors.some(e => e.severity === 'CRITICAL'));
    const activeCommitments = commitments.filter(c => c.commitment_status !== 'cancelled' && c.commitment_status !== 'closed');

    // Determine overall status
    let integrity_status = 'OK';
    if (billingViolations.length > 0 || stockViolations.length > 0 || coverageViolations.length > 0 || locationSumViolations.length > 0) {
      integrity_status = 'FAIL';
    } else if (warnings.length > 0) {
      integrity_status = 'DEGRADED';
    }

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_parts: parts.length,
        total_commitments: activeCommitments.length,
        valid_count: validCount,
        violation_count: violations.length,
        warning_count: warnings.length,
        has_critical: hasCritical,
        // Phase 9H specific counts
        billing_violations: billingViolations.length,
        stock_violations: stockViolations.length,
        coverage_violations: coverageViolations.length,
        // Phase 13B
        location_sum_violations: locationSumViolations.length,
        integrity_status
      },
      // Phase 9H specific details
      billing_flag_issues: billingViolations.slice(0, 20),
      stock_drift_issues: stockViolations.slice(0, 20),
      coverage_issues: coverageViolations.slice(0, 20),
      // Phase 13B
      location_sum_issues: locationSumViolations.slice(0, 20),
      // Legacy format
      violations,
      warnings,
      fix_mode_available: false
    });

  } catch (error) {
    console.error('validateSupplyIntegrity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});