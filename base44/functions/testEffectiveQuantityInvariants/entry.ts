import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * testEffectiveQuantityInvariants — Comprehensive invariant test suite
 * 
 * Tests 1-4: Core math invariants
 * Test 5: UI blocking — violation exists → actions disabled
 * Test 6: Clean state — no violations → full system enabled
 */

function validate(c) {
  const required_total = c.required_total ?? 0;
  const qty_removed = c.qty_removed ?? 0;
  const eff = Math.max(0, required_total - qty_removed);
  const TOL = 0.001;
  const violations = [];
  if ((c.qty_installed ?? 0) > eff + TOL) violations.push({ field: 'qty_installed', value: c.qty_installed, limit: eff });
  if ((c.reserved_from_stock ?? 0) > eff + TOL) violations.push({ field: 'reserved_from_stock', value: c.reserved_from_stock, limit: eff });
  if ((c.covered_from_po ?? 0) > eff + TOL) violations.push({ field: 'covered_from_po', value: c.covered_from_po, limit: eff });
  if ((c.invoiced_qty ?? 0) > eff + TOL) violations.push({ field: 'invoiced_qty', value: c.invoiced_qty, limit: eff });
  const total = (c.reserved_from_stock ?? 0) + (c.covered_from_po ?? 0) + (c.qty_installed ?? 0);
  if (total > eff + TOL) violations.push({ field: '_combined', value: total, limit: eff });
  return { valid: violations.length === 0, violations, blocking: violations.length > 0, effective_required: eff };
}

function computeEffective(c) {
  const required_total = c.required_total ?? 0;
  const qty_removed = c.qty_removed ?? 0;
  const effective_required = Math.max(0, required_total - qty_removed);
  const reserved = c.reserved_from_stock ?? 0;
  const covered = c.covered_from_po ?? 0;
  const installed = c.qty_installed ?? 0;
  return {
    effective_required,
    available_to_install: Math.max(0, reserved - installed),
    available_to_order: Math.max(0, effective_required - reserved - covered - installed),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const { scan_live = false } = await req.json().catch(() => ({}));
    const results = [];

    // T1: Removed qty cannot be reused
    {
      const mock = { required_total: 10, qty_removed: 4, reserved_from_stock: 3, covered_from_po: 0, qty_installed: 2, invoiced_qty: 0 };
      const q = computeEffective(mock);
      const pass = q.effective_required === 6 && q.available_to_install === 1 && q.available_to_order === 1;
      results.push({ test: 'T1_REMOVED_QTY_EXCLUDED', pass, expected: { eff: 6, install: 1, order: 1 }, actual: q });
    }

    // T2: Over-install blocked
    {
      const mock = { required_total: 10, qty_removed: 4, reserved_from_stock: 3, covered_from_po: 0, qty_installed: 7, invoiced_qty: 0 };
      const v = validate(mock);
      results.push({ test: 'T2_OVER_INSTALL_BLOCKED', pass: v.blocking && v.violations.some(x => x.field === 'qty_installed'), actual: v });
    }

    // T3: Over-order blocked
    {
      const mock = { required_total: 10, qty_removed: 4, reserved_from_stock: 4, covered_from_po: 4, qty_installed: 0, invoiced_qty: 0 };
      const v = validate(mock);
      results.push({ test: 'T3_OVER_ORDER_BLOCKED', pass: v.blocking && v.violations.some(x => x.field === '_combined'), actual: v });
    }

    // T4: Partial removal stability
    {
      const before = { required_total: 10, qty_removed: 0, reserved_from_stock: 5, covered_from_po: 3, qty_installed: 2 };
      const after = { required_total: 10, qty_removed: 3, reserved_from_stock: 5, covered_from_po: 2, qty_installed: 2 };
      const qBefore = computeEffective(before);
      const qAfter = computeEffective(after);
      results.push({ test: 'T4_PARTIAL_REMOVAL_STABILITY', pass: qBefore.effective_required === 10 && qAfter.effective_required === 7, actual: { before: qBefore, after: qAfter } });
    }

    // T5: UI blocking — violation exists → blocking=true
    {
      const violated = { required_total: 10, qty_removed: 6, reserved_from_stock: 5, covered_from_po: 0, qty_installed: 0, invoiced_qty: 0 };
      const v = validate(violated);
      // effective=4, reserved=5 > 4 → blocking
      results.push({ test: 'T5_UI_BLOCKING_VIOLATION', pass: v.blocking === true, actual: v });
    }

    // T6: Clean state — no violations → blocking=false
    {
      const clean = { required_total: 10, qty_removed: 0, reserved_from_stock: 3, covered_from_po: 4, qty_installed: 2, invoiced_qty: 0 };
      const v = validate(clean);
      results.push({ test: 'T6_CLEAN_STATE_ENABLED', pass: v.blocking === false && v.valid === true, actual: v });
    }

    // Live scan
    let liveScan = null;
    if (scan_live) {
      const commitments = await base44.entities.PartCommitment.filter(
        { commitment_status: { $nin: ['cancelled', 'closed'] } }, '-created_date', 500
      );
      const violations = [];
      for (const c of commitments) {
        const v = validate(c);
        if (v.blocking) {
          violations.push({ commitment_id: c.id, project_id: c.project_id, part_id: c.part_id, effective_required: v.effective_required, violations: v.violations });
        }
      }
      liveScan = { scanned: commitments.length, violations_found: violations.length, violations: violations.slice(0, 50) };
    }

    const allPassed = results.every(r => r.pass);
    return Response.json({ success: true, all_passed: allPassed, results, live_scan: liveScan });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});