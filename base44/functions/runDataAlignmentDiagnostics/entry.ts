import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * PHASE 2: Data Alignment Diagnostics
 * Scans all commitments and PO lines to surface:
 * - Canonical/deprecated field mismatches
 * - Negative covered_from_po
 * - Reserved exceeds physical stock
 * - Coverage invariant violations (reserved + covered + gap != required)
 * - Orphan PO lines (no commitment_id)
 * Returns structured issues grouped by severity.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin required' }, { status: 403 });

    const { project_id, limit = 500 } = await req.json();

    // Fetch data
    const commitmentFilter = project_id ? { project_id } : {};
    const [commitments, parts, poLines] = await Promise.all([
      base44.asServiceRole.entities.PartCommitment.filter(commitmentFilter, '-created_date', limit),
      base44.asServiceRole.entities.Part.list('-updated_date', 500),
      base44.asServiceRole.entities.PartPurchaseLineItem.list('-created_date', limit),
    ]);

    const partMap = new Map(parts.map(p => [p.id, p]));
    const issues = [];

    // ── Scan Commitments ──
    for (const c of commitments) {
      if (c.commitment_status === 'cancelled') continue;
      const part = partMap.get(c.part_id);
      const base = { entity: 'PartCommitment', id: c.id, project_id: c.project_id, part_id: c.part_id, part_name: part?.part_name || 'Unknown' };

      // Canonical values
      const rt = c.required_total ?? 0;
      const rfs = c.reserved_from_stock ?? 0;
      const cfp = c.covered_from_po ?? 0;
      const qi = c.qty_installed ?? 0;
      const gap = Math.max(0, rt - rfs - cfp);

      // 1. Canonical/deprecated mismatches
      if (c.qty_committed !== undefined && c.qty_committed !== rt) {
        issues.push({ ...base, severity: 'warning', type: 'FIELD_MISMATCH', field: 'qty_committed', current: c.qty_committed, expected: rt, message: `qty_committed(${c.qty_committed}) != required_total(${rt})`, fix: { required_total: rt, qty_committed: rt } });
      }
      if (c.qty_reserved !== undefined && c.qty_reserved !== rfs) {
        issues.push({ ...base, severity: 'warning', type: 'FIELD_MISMATCH', field: 'qty_reserved', current: c.qty_reserved, expected: rfs, message: `qty_reserved(${c.qty_reserved}) != reserved_from_stock(${rfs})`, fix: { qty_reserved: rfs } });
      }
      const expectedTO = gap;
      if (c.qty_to_order !== undefined && Math.abs((c.qty_to_order ?? 0) - expectedTO) > 0.01) {
        issues.push({ ...base, severity: 'warning', type: 'FIELD_MISMATCH', field: 'qty_to_order', current: c.qty_to_order, expected: expectedTO, message: `qty_to_order(${c.qty_to_order}) != computed gap(${expectedTO})`, fix: { qty_to_order: expectedTO } });
      }

      // 2. Negative covered_from_po
      if (cfp < 0) {
        issues.push({ ...base, severity: 'error', type: 'NEGATIVE_COVERED', field: 'covered_from_po', current: cfp, expected: 0, message: `covered_from_po is negative (${cfp})`, fix: { covered_from_po: 0 } });
      }

      // 3. Reserved exceeds physical stock
      if (part && rfs > (part.physical_stock ?? 0)) {
        issues.push({ ...base, severity: 'error', type: 'RESERVED_EXCEEDS_STOCK', field: 'reserved_from_stock', current: rfs, expected: part.physical_stock ?? 0, message: `reserved(${rfs}) > physical_stock(${part.physical_stock ?? 0})`, fix: null });
      }

      // 4. Coverage invariant: reserved + covered + gap should equal required - installed remaining
      const remainingReq = Math.max(0, rt - qi);
      const allocSum = rfs + cfp + gap;
      if (remainingReq > 0 && Math.abs(allocSum - remainingReq) > 0.01) {
        issues.push({ ...base, severity: 'error', type: 'INVARIANT_VIOLATION', field: 'allocation_sum', current: allocSum, expected: remainingReq, message: `reserved(${rfs})+covered(${cfp})+gap(${gap})=${allocSum} != remaining(${remainingReq})`, fix: null });
      }

      // 5. Installed exceeds required
      if (qi > rt && rt > 0) {
        issues.push({ ...base, severity: 'warning', type: 'INSTALLED_EXCEEDS_REQUIRED', field: 'qty_installed', current: qi, expected: rt, message: `installed(${qi}) > required(${rt})`, fix: null });
      }
    }

    // ── Scan PO Lines for orphans ──
    const orphanLines = poLines.filter(li => !li.commitment_id);
    for (const li of orphanLines) {
      const part = partMap.get(li.part_id);
      issues.push({
        entity: 'PartPurchaseLineItem', id: li.id, order_id: li.order_id,
        part_id: li.part_id, part_name: part?.part_name || 'Unknown',
        severity: 'warning', type: 'ORPHAN_PO_LINE', field: 'commitment_id',
        current: null, expected: 'linked', 
        message: `PO line has no commitment_id (order: ${li.order_id}, qty: ${li.qty_ordered})`,
        fix: null
      });
    }

    // ── Summary ──
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const byType = {};
    for (const i of issues) { byType[i.type] = (byType[i.type] || 0) + 1; }

    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      scanned: { commitments: commitments.length, po_lines: poLines.length, parts: parts.length },
      summary: { total: issues.length, errors: errors.length, warnings: warnings.length, by_type: byType },
      issues,
      orphan_po_lines: orphanLines.length,
    });
  } catch (error) {
    console.error('runDataAlignmentDiagnostics error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});