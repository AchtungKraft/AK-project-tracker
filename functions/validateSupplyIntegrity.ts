import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * validateSupplyIntegrity - Admin tool for supply math validation
 * 
 * Validates ALL invariants across project supply data:
 * 1. Coverage Invariant: required_total = reserved_from_stock + covered_from_po + to_order
 * 2. Stock Non-Negative: physical_stock >= 0
 * 3. Reservation Non-Negative: reserved_from_stock >= 0
 * 4. Coverage Non-Negative: covered_from_po >= 0
 * 5. Installed <= Reserved + Received
 * 
 * Returns detailed violation report.
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

    const { project_id, fix_mode = false } = await req.json();

    // Fetch data
    const filter = project_id ? { project_id } : {};
    const [commitments, parts] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.filter(filter),
      base44.asServiceRole.entities.Part.list(),
    ]);

    const partMap = new Map(parts.map(p => [p.id, p]));
    
    const violations = [];
    const warnings = [];
    let validCount = 0;

    // Validate each commitment
    for (const c of commitments) {
      // Skip cancelled commitments
      if (c.commitment_status === 'cancelled') continue;

      const part = partMap.get(c.part_id);
      const required_total = c.required_total ?? c.qty_committed ?? 0;
      const reserved_from_stock = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered_from_po = c.covered_from_po ?? c.qty_ordered ?? 0;
      const to_order = c.qty_to_order ?? 0;
      const qty_installed = c.qty_installed ?? 0;
      const qty_received = c.qty_received ?? 0;

      const commitmentViolations = [];

      // 1. Coverage Invariant
      const sum = reserved_from_stock + covered_from_po + to_order;
      if (Math.abs(sum - required_total) > 0.01) {
        commitmentViolations.push({
          code: 'COVERAGE_INVARIANT',
          message: `required(${required_total}) != reserved(${reserved_from_stock}) + covered(${covered_from_po}) + to_order(${to_order}) = ${sum}`,
          severity: 'CRITICAL'
        });
      }

      // 2. Negative reserved
      if (reserved_from_stock < 0) {
        commitmentViolations.push({
          code: 'NEGATIVE_RESERVED',
          message: `reserved_from_stock = ${reserved_from_stock}`,
          severity: 'CRITICAL'
        });
      }

      // 3. Negative covered
      if (covered_from_po < 0) {
        commitmentViolations.push({
          code: 'NEGATIVE_COVERED',
          message: `covered_from_po = ${covered_from_po}`,
          severity: 'CRITICAL'
        });
      }

      // 4. Installed exceeds available
      const available_to_install = reserved_from_stock + qty_received;
      if (qty_installed > available_to_install + 0.01) {
        commitmentViolations.push({
          code: 'INSTALLED_EXCEEDS_AVAILABLE',
          message: `installed(${qty_installed}) > reserved(${reserved_from_stock}) + received(${qty_received}) = ${available_to_install}`,
          severity: 'WARNING'
        });
      }

      // 5. Part physical stock check
      if (part && (part.physical_stock ?? 0) < 0) {
        commitmentViolations.push({
          code: 'NEGATIVE_PHYSICAL_STOCK',
          message: `Part ${part.part_name} has physical_stock = ${part.physical_stock}`,
          severity: 'CRITICAL'
        });
      }

      if (commitmentViolations.length > 0) {
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
          errors: commitmentViolations
        });
      } else {
        validCount++;
      }
    }

    // Check for orphaned reservations (reserved > physical across all commitments for a part)
    const partReservations = new Map();
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled') continue;
      const partId = c.part_id;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      partReservations.set(partId, (partReservations.get(partId) || 0) + reserved);
    }

    for (const [partId, totalReserved] of partReservations) {
      const part = partMap.get(partId);
      const physical = part?.physical_stock ?? 0;
      if (totalReserved > physical + 0.01) {
        warnings.push({
          code: 'OVER_RESERVED',
          part_id: partId,
          part_name: part?.part_name || 'Unknown',
          message: `Total reserved(${totalReserved}) > physical_stock(${physical})`,
          severity: 'WARNING'
        });
      }
    }

    const hasCritical = violations.some(v => v.errors.some(e => e.severity === 'CRITICAL'));

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_commitments: commitments.filter(c => c.commitment_status !== 'cancelled').length,
        valid_count: validCount,
        violation_count: violations.length,
        warning_count: warnings.length,
        has_critical: hasCritical,
        integrity_status: hasCritical ? 'FAILED' : violations.length > 0 ? 'DEGRADED' : 'OK'
      },
      violations,
      warnings,
      fix_mode_available: false // Future: auto-fix capability
    });

  } catch (error) {
    console.error('validateSupplyIntegrity error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});