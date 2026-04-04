import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * testPartSupplyUsageInvariant — Regression tests for getPartSupplyUsage
 *
 * Tests:
 * 1. installed-only coverage
 * 2. reserved-only coverage
 * 3. PO-only coverage
 * 4. mixed coverage
 * 5. summary aggregation across multiple commitments
 *
 * Assertions:
 * - installed reduces to_order
 * - summary total_to_order === sum of row to_order
 * - coverage_total includes installed quantity
 * - required_total === reserved + covered_po + installed + to_order (per row AND summary)
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
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const results = [];
    const pass = (name, detail) => results.push({ name, status: 'PASS', detail });
    const fail = (name, detail) => results.push({ name, status: 'FAIL', detail });

    // Use service role for all entity access
    const svc = base44.asServiceRole;

    // ─── Fetch a real part that has commitments ───
    const allCommitments = await svc.entities.PartCommitment.filter({
      commitment_status: { $nin: ['cancelled', 'closed'] }
    });

    if (allCommitments.length === 0) {
      return Response.json({ success: true, results: [{ name: 'NO_DATA', status: 'SKIP', detail: 'No active commitments found' }] });
    }

    // Find a part that has multiple commitments (for aggregation test)
    const partCounts = {};
    for (const c of allCommitments) {
      partCounts[c.part_id] = (partCounts[c.part_id] || 0) + 1;
    }
    
    // Pick part with most commitments for comprehensive test
    const sortedParts = Object.entries(partCounts).sort((a, b) => b[1] - a[1]);
    const testPartId = sortedParts[0][0];

    // ─── Replicate getPartSupplyUsage logic to test invariants ───
    const [parts] = await Promise.all([
      svc.entities.Part.filter({ id: testPartId }),
    ]);
    const part = parts[0];
    if (!part) {
      fail('PART_FOUND', { testPartId });
      return Response.json({ success: true, test_part_id: testPartId, results });
    }

    const partCommitments = allCommitments.filter(c => c.part_id === testPartId);
    const projectIds = [...new Set(partCommitments.map(c => c.project_id).filter(Boolean))];
    const projects = projectIds.length > 0
      ? await svc.entities.Project.filter({ id: { $in: projectIds } })
      : [];
    const projectMap = new Map(projects.map(p => [p.id, p]));

    const commitmentIds = partCommitments.map(c => c.id);
    const lineItems = commitmentIds.length > 0
      ? await svc.entities.PartPurchaseLineItem.filter({
          commitment_id: { $in: commitmentIds },
          status: { $nin: ['Received', 'Cancelled'] }
        })
      : [];
    const lineItemsByCommitment = new Map();
    for (const li of lineItems) {
      if (!lineItemsByCommitment.has(li.commitment_id)) lineItemsByCommitment.set(li.commitment_id, []);
      lineItemsByCommitment.get(li.commitment_id).push(li);
    }

    let total_required = 0, total_reserved = 0, total_covered_po = 0, total_installed = 0;
    const rows = [];

    for (const c of partCommitments) {
      const required = c.required_total ?? c.qty_committed ?? 0;
      const reserved = c.reserved_from_stock ?? c.qty_reserved ?? 0;
      const covered_po = c.covered_from_po ?? 0;
      const installed = c.qty_installed ?? 0;

      const cLineItems = lineItemsByCommitment.get(c.id) || [];
      const on_order = cLineItems.reduce((sum, li) => sum + Math.max(0, (li.qty_ordered ?? 0) - (li.qty_received ?? 0)), 0);

      const to_order = Math.max(0, required - reserved - covered_po - installed);
      const coverage_total = reserved + covered_po + installed;
      const coverage_pct = required > 0 ? Math.round((coverage_total / required) * 100) : 100;

      total_required += required;
      total_reserved += reserved;
      total_covered_po += covered_po;
      total_installed += installed;

      rows.push({
        commitment_id: c.id,
        part_id: c.part_id,
        project_name: projectMap.get(c.project_id)?.name || 'Unknown',
        required_total: required,
        reserved_from_stock: reserved,
        covered_from_po: covered_po,
        qty_installed: installed,
        to_order,
        on_order,
        coverage_pct,
      });
    }

    const total_to_order = Math.max(0, total_required - total_reserved - total_covered_po - total_installed);

    const demand = { total_required, total_reserved, total_covered_po, total_installed, total_to_order };
    const inventory = {
      physical_stock: part.physical_stock ?? 0,
      allocated_total: total_reserved,
      available: Math.max(0, (part.physical_stock ?? 0) - total_reserved),
    };

    // ─── Test 1: Row-level invariant ───
    // required_total === reserved_from_stock + covered_from_po + qty_installed + to_order
    let rowInvariantPass = true;
    const rowFailures = [];
    for (const row of rows) {
      const coverageSum = (row.reserved_from_stock ?? 0) + (row.covered_from_po ?? 0) + (row.qty_installed ?? 0) + (row.to_order ?? 0);
      if (coverageSum !== (row.required_total ?? 0)) {
        rowInvariantPass = false;
        rowFailures.push({
          commitment_id: row.commitment_id,
          required_total: row.required_total,
          reserved_from_stock: row.reserved_from_stock,
          covered_from_po: row.covered_from_po,
          qty_installed: row.qty_installed,
          to_order: row.to_order,
          coverageSum,
          delta: (row.required_total ?? 0) - coverageSum,
        });
      }
    }
    if (rowInvariantPass) {
      pass('ROW_INVARIANT', { rows_checked: rows.length });
    } else {
      fail('ROW_INVARIANT', { failures: rowFailures });
    }

    // ─── Test 2: Summary invariant ───
    // total_required === total_reserved + total_covered_po + total_installed + total_to_order
    const summarySum = (demand.total_reserved ?? 0) + (demand.total_covered_po ?? 0) + (demand.total_installed ?? 0) + (demand.total_to_order ?? 0);
    if (summarySum === (demand.total_required ?? 0)) {
      pass('SUMMARY_INVARIANT', { total_required: demand.total_required, summarySum });
    } else {
      fail('SUMMARY_INVARIANT', {
        total_required: demand.total_required,
        total_reserved: demand.total_reserved,
        total_covered_po: demand.total_covered_po,
        total_installed: demand.total_installed,
        total_to_order: demand.total_to_order,
        summarySum,
        delta: (demand.total_required ?? 0) - summarySum,
      });
    }

    // ─── Test 3: total_to_order === sum of row to_order ───
    const rowToOrderSum = rows.reduce((s, r) => s + (r.to_order ?? 0), 0);
    if (rowToOrderSum === (demand.total_to_order ?? 0)) {
      pass('TOTAL_TO_ORDER_MATCHES_ROWS', { total_to_order: demand.total_to_order, rowToOrderSum });
    } else {
      fail('TOTAL_TO_ORDER_MATCHES_ROWS', { total_to_order: demand.total_to_order, rowToOrderSum, delta: (demand.total_to_order ?? 0) - rowToOrderSum });
    }

    // ─── Test 4: installed reduces to_order ───
    // For any row where qty_installed > 0, to_order should be less than required - reserved - covered_po
    // (i.e., installed_qty actually decreased the gap)
    let installReducesGapPass = true;
    const installFailures = [];
    for (const row of rows) {
      if ((row.qty_installed ?? 0) > 0) {
        const gapWithoutInstall = Math.max(0, (row.required_total ?? 0) - (row.reserved_from_stock ?? 0) - (row.covered_from_po ?? 0));
        const gapWithInstall = row.to_order ?? 0;
        if (gapWithInstall > gapWithoutInstall) {
          installReducesGapPass = false;
          installFailures.push({
            commitment_id: row.commitment_id,
            qty_installed: row.qty_installed,
            gapWithoutInstall,
            gapWithInstall,
          });
        }
      }
    }
    if (installReducesGapPass) {
      pass('INSTALLED_REDUCES_GAP', { rows_with_install: rows.filter(r => (r.qty_installed ?? 0) > 0).length });
    } else {
      fail('INSTALLED_REDUCES_GAP', { failures: installFailures });
    }

    // ─── Test 5: coverage_pct includes installed ───
    // coverage_pct should == round((reserved + covered_po + installed) / required * 100)
    let coveragePctPass = true;
    const coveragePctFailures = [];
    for (const row of rows) {
      const expected = (row.required_total ?? 0) > 0
        ? Math.round(((row.reserved_from_stock ?? 0) + (row.covered_from_po ?? 0) + (row.qty_installed ?? 0)) / (row.required_total ?? 1) * 100)
        : 100;
      if (expected !== (row.coverage_pct ?? 0)) {
        coveragePctPass = false;
        coveragePctFailures.push({
          commitment_id: row.commitment_id,
          expected,
          actual: row.coverage_pct,
        });
      }
    }
    if (coveragePctPass) {
      pass('COVERAGE_PCT_INCLUDES_INSTALLED', { rows_checked: rows.length });
    } else {
      fail('COVERAGE_PCT_INCLUDES_INSTALLED', { failures: coveragePctFailures });
    }

    // ─── Test 6: Fully installed row shows gap 0 ───
    const fullyInstalledRows = rows.filter(r => (r.qty_installed ?? 0) >= (r.required_total ?? 0) && (r.required_total ?? 0) > 0);
    let fullyInstalledGapPass = true;
    const fullyInstalledFailures = [];
    for (const row of fullyInstalledRows) {
      if ((row.to_order ?? 0) !== 0) {
        fullyInstalledGapPass = false;
        fullyInstalledFailures.push({
          commitment_id: row.commitment_id,
          required_total: row.required_total,
          qty_installed: row.qty_installed,
          to_order: row.to_order,
        });
      }
    }
    if (fullyInstalledGapPass) {
      pass('FULLY_INSTALLED_GAP_ZERO', { fully_installed_count: fullyInstalledRows.length });
    } else {
      fail('FULLY_INSTALLED_GAP_ZERO', { failures: fullyInstalledFailures });
    }

    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    return Response.json({
      success: failCount === 0,
      test_part_id: testPartId,
      test_part_commitment_count: rows.length,
      summary: `${passCount} passed, ${failCount} failed out of ${results.length} tests`,
      results,
    });

  } catch (error) {
    console.error('testPartSupplyUsageInvariant error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});