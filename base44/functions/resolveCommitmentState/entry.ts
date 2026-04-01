import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const ids = body.commitment_ids || (body.commitment_id ? [body.commitment_id] : []);
    if (!ids.length) return Response.json({ error: 'commitment_id or commitment_ids required' }, { status: 400 });
    const commitments = await base44.entities.PartCommitment.filter({ id: { $in: ids } });
    if (!commitments.length) return Response.json({ error: 'No commitments found' }, { status: 404 });
    const partIds = [...new Set(commitments.map(c => c.part_id).filter(Boolean))];
    const parts = partIds.length > 0 ? await base44.entities.Part.filter({ id: { $in: partIds } }) : [];
    const partMap = new Map(parts.map(p => [p.id, p]));
    const results = commitments.map(c => resolveState(c, partMap.get(c.part_id)));
    if (body.commitment_id && !body.commitment_ids) return Response.json(results[0]);
    return Response.json({ commitments: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function resolveState(c, part) {
  const rt = c.required_total || 0;
  const rfs = c.reserved_from_stock || 0;
  const cfp = c.covered_from_po || 0;
  const qi = c.qty_installed || 0;
  const sst = c.supply_source_type || 'VENDOR';
  const ct = rfs + cfp;
  const gap = Math.max(0, rt - ct);
  const ov = Math.max(0, ct - rt);
  let ls = 'PLANNED';
  if (qi >= rt && rt > 0) ls = 'INSTALLED';
  else if (rfs >= rt && rt > 0) ls = 'INSTALL_READY';
  else if (ct >= rt && rt > 0) ls = 'COVERED';
  else if (gap > 0) ls = 'NEEDS_ORDER';
  let cs = 'NOT_COVERED';
  if (ct >= rt && rt > 0) cs = 'FULLY_COVERED';
  else if (ct > 0) cs = 'PARTIALLY_COVERED';
  const inv = [];
  if (rfs > rt) inv.push({ rule: 'RESERVED_EXCEEDS_REQUIRED', severity: 'error', message: 'reserved(' + rfs + ') > required(' + rt + ')' });
  if (qi > rt) inv.push({ rule: 'INSTALLED_EXCEEDS_REQUIRED', severity: 'error', message: 'installed(' + qi + ') > required(' + rt + ')' });
  if (cfp < 0) inv.push({ rule: 'NEGATIVE_PO_COVERAGE', severity: 'error', message: 'covered_from_po negative' });
  if (ov > 0) inv.push({ rule: 'OVERAGE_DETECTED', severity: 'warning', message: 'Coverage exceeds required by ' + ov });
  if (part) {
    const ph = part.physical_stock || 0;
    if (rfs > ph) inv.push({ rule: 'RESERVED_EXCEEDS_PHYSICAL', severity: 'warning', message: 'reserved(' + rfs + ') > physical(' + ph + ')' });
  }
  const asum = rfs + cfp + gap;
  if (rt > 0 && Math.abs(asum - rt) > 0.01) inv.push({ rule: 'ALLOCATION_SUM_MISMATCH', severity: 'error', message: 'sum mismatch' });
  if (c.qty_committed !== undefined && c.qty_committed !== rt) inv.push({ rule: 'DEPRECATED_MISMATCH_QTY_COMMITTED', severity: 'warning', message: 'qty_committed mismatch' });
  if (c.qty_reserved !== undefined && c.qty_reserved !== rfs) inv.push({ rule: 'DEPRECATED_MISMATCH_QTY_RESERVED', severity: 'warning', message: 'qty_reserved mismatch' });
  let is2 = 'valid';
  if (inv.some(i => i.severity === 'error')) is2 = 'error';
  else if (inv.some(i => i.severity === 'warning')) is2 = 'warning';
  const afi = Math.max(0, Math.min(rfs, rt) - qi);
  const aa = [];
  if (gap > 0 && sst === 'VENDOR') aa.push('CREATE_PO');
  if (rfs < rt && sst === 'STOCK') aa.push('AUTO_RESERVE');
  if (afi > 0) aa.push('INSTALL');
  if (qi > 0) aa.push('REVERSE_INSTALL');
  if (c.commitment_status !== 'cancelled') aa.push('CANCEL_COMMITMENT');
  aa.push('ADJUST_REQUIRED');
  return {
    commitment_id: c.id, project_id: c.project_id, part_id: c.part_id,
    required_total: rt, reserved_from_stock: rfs, covered_from_po: cfp, qty_installed: qi, supply_source_type: sst,
    coverage_total: ct, gap: gap, overage: ov, available_for_install: afi,
    lifecycle_state: ls, coverage_status: cs, invariant_status: is2, invariants: inv,
    allowed_actions: aa,
    billing_status: c.billing_status,
    unit_cost_snapshot: c.unit_cost_snapshot, unit_retail_snapshot: c.unit_retail_snapshot,
    planned_cost_total: c.planned_cost_total || (c.unit_cost_snapshot || 0) * rt,
    planned_retail_total: c.planned_retail_total || (c.unit_retail_snapshot || 0) * rt,
    legacy: { qty_committed: c.qty_committed, qty_reserved: c.qty_reserved, qty_to_order: c.qty_to_order, qty_ordered: c.qty_ordered, qty_received: c.qty_received, qty_allocated: c.qty_allocated }
  };
}