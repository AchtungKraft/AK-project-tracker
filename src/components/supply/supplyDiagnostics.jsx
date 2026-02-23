/**
 * SUPPLY READ MODEL DIAGNOSTIC REPORT
 * 
 * SAFE / READ-ONLY / NO MUTATIONS
 * 
 * This module instruments the canonical supply read model to assess inventory math drift.
 * 
 * DO NOT modify business logic.
 * DO NOT normalize data.
 * DO NOT recompute fields differently.
 * DO NOT change routing.
 * DO NOT alter UI layout.
 * 
 * This is diagnostic only.
 */

/**
 * Run full diagnostic on a single commitment item
 * Returns diagnostic object with drift flags
 */
export function diagnoseCommitment(item, sourceName = 'Unknown') {
  const inv = item.inventory_snapshot || {};
  
  // Extract canonical fields exactly as returned
  const canonical = {
    commitment_id: item.commitment_id,
    part_id: item.part_id,
    project_id: item.project_id,
    
    required_total: item.required_total,
    reserved_from_stock: item.reserved_from_stock,
    covered_from_po: item.covered_from_po,
    qty_installed: item.qty_installed,
    
    to_order: item.to_order,
    coverage_status: item.coverage_status,
    
    inventory_snapshot: {
      physical: inv.physical_stock_global ?? inv.physical ?? null,
      reserved_global_active: inv.reserved_global_active ?? inv.reserved ?? null,
      reserved_this_project: inv.reserved_this_project ?? null,
      available: inv.available_global_active ?? inv.available ?? null,
    }
  };
  
  // Compute (without mutating)
  const physical = canonical.inventory_snapshot.physical ?? 0;
  const reserved_global_active = canonical.inventory_snapshot.reserved_global_active ?? 0;
  const reserved_from_stock = canonical.reserved_from_stock ?? 0;
  const covered_from_po = canonical.covered_from_po ?? 0;
  const required_total = canonical.required_total ?? 0;
  
  const computedAvailable = physical - reserved_global_active;
  const computedCovered = reserved_from_stock + covered_from_po;
  const computedGap = required_total - computedCovered;
  
  const computed = {
    computedAvailable,
    computedCovered,
    computedGap,
  };
  
  // Drift detection
  const drifts = [];
  
  // AVAILABLE DRIFT
  const actualAvailable = canonical.inventory_snapshot.available ?? 0;
  if (actualAvailable !== computedAvailable) {
    drifts.push({
      type: 'AVAILABLE_DRIFT',
      commitment_id: canonical.commitment_id,
      actual: actualAvailable,
      computed: computedAvailable,
      delta: actualAvailable - computedAvailable,
    });
  }
  
  // GAP DRIFT
  const actualToOrder = canonical.to_order ?? 0;
  if (actualToOrder !== computedGap) {
    drifts.push({
      type: 'GAP_DRIFT',
      commitment_id: canonical.commitment_id,
      actual_to_order: actualToOrder,
      computed_gap: computedGap,
      delta: actualToOrder - computedGap,
    });
  }
  
  // COVERAGE DRIFT
  const coverageStatus = canonical.coverage_status;
  if (computedGap === 0 && coverageStatus !== 'FULL' && required_total > 0) {
    drifts.push({
      type: 'COVERAGE_DRIFT',
      commitment_id: canonical.commitment_id,
      issue: 'computedGap === 0 but coverage_status !== FULL',
      coverage_status: coverageStatus,
      computed_gap: computedGap,
    });
  }
  if (computedGap > 0 && coverageStatus === 'FULL') {
    drifts.push({
      type: 'COVERAGE_DRIFT',
      commitment_id: canonical.commitment_id,
      issue: 'computedGap > 0 but coverage_status === FULL',
      coverage_status: coverageStatus,
      computed_gap: computedGap,
    });
  }
  
  // NEGATIVE CONDITIONS
  if (actualAvailable < 0) {
    drifts.push({
      type: 'NEGATIVE_AVAILABLE',
      commitment_id: canonical.commitment_id,
      value: actualAvailable,
    });
  }
  if (actualToOrder < 0) {
    drifts.push({
      type: 'NEGATIVE_TO_ORDER',
      commitment_id: canonical.commitment_id,
      value: actualToOrder,
    });
  }
  if (computedGap < 0) {
    drifts.push({
      type: 'NEGATIVE_COMPUTED_GAP',
      commitment_id: canonical.commitment_id,
      value: computedGap,
    });
  }
  
  return {
    source: sourceName,
    canonical,
    computed,
    drifts,
    hasDrift: drifts.length > 0,
  };
}

/**
 * Run full diagnostic on array of commitment items
 * Returns summary and per-item diagnostics
 */
export function diagnoseSupplyItems(items, sourceName = 'Unknown') {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const diagnostics = items.map(item => diagnoseCommitment(item, sourceName));
  
  // Build summary
  const summary = {
    source: sourceName,
    total_commitments: items.length,
    available_drift_count: 0,
    gap_drift_count: 0,
    coverage_drift_count: 0,
    negative_value_count: 0,
    items_with_drift: 0,
  };
  
  diagnostics.forEach(d => {
    if (d.hasDrift) {
      summary.items_with_drift++;
    }
    d.drifts.forEach(drift => {
      if (drift.type === 'AVAILABLE_DRIFT') summary.available_drift_count++;
      if (drift.type === 'GAP_DRIFT') summary.gap_drift_count++;
      if (drift.type === 'COVERAGE_DRIFT') summary.coverage_drift_count++;
      if (drift.type.startsWith('NEGATIVE_')) summary.negative_value_count++;
    });
  });
  
  // Log to console
  console.group(`[SUPPLY DIAGNOSTIC] ${sourceName}`);
  console.log('Summary:', summary);
  
  // Log individual drifts
  diagnostics.forEach(d => {
    if (d.hasDrift) {
      d.drifts.forEach(drift => {
        console.warn('[SUPPLY DRIFT DETECTED]', drift);
      });
    }
  });
  
  // Log sample canonical data for verification
  if (items.length > 0) {
    console.log('Sample canonical fields:', diagnostics[0].canonical);
    console.log('Sample computed fields:', diagnostics[0].computed);
  }
  
  console.groupEnd();
  
  return {
    summary,
    diagnostics,
  };
}

/**
 * Cross-view consistency check
 * Compares PSM view and GNO view for same project/commitment
 */
export function compareViews(psmItems, gnoItems, projectId) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const mismatches = [];
  
  // Build lookup by commitment_id
  const psmMap = new Map();
  psmItems.forEach(item => {
    if (item.project_id === projectId || !projectId) {
      psmMap.set(item.commitment_id, item);
    }
  });
  
  const gnoMap = new Map();
  gnoItems.forEach(item => {
    if (item.project_id === projectId || !projectId) {
      gnoMap.set(item.commitment_id, item);
    }
  });
  
  // Compare fields for matching commitment_ids
  const fieldsToCompare = [
    { path: 'inventory_snapshot.physical_stock_global', alias: 'physical' },
    { path: 'inventory_snapshot.physical', alias: 'physical_fallback' },
    { path: 'inventory_snapshot.reserved_global_active', alias: 'reserved_global_active' },
    { path: 'inventory_snapshot.reserved', alias: 'reserved_fallback' },
    { path: 'inventory_snapshot.available_global_active', alias: 'available' },
    { path: 'inventory_snapshot.available', alias: 'available_fallback' },
    { path: 'to_order', alias: 'to_order' },
    { path: 'coverage_status', alias: 'coverage_status' },
    { path: 'required_total', alias: 'required_total' },
    { path: 'reserved_from_stock', alias: 'reserved_from_stock' },
    { path: 'covered_from_po', alias: 'covered_from_po' },
  ];
  
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  };
  
  // Check all commitments in PSM that also exist in GNO
  psmMap.forEach((psmItem, commitmentId) => {
    const gnoItem = gnoMap.get(commitmentId);
    if (!gnoItem) return; // Only compare if exists in both views
    
    fieldsToCompare.forEach(({ path, alias }) => {
      const psmValue = getNestedValue(psmItem, path);
      const gnoValue = getNestedValue(gnoItem, path);
      
      // Only compare if both have the value (not null/undefined)
      if (psmValue !== undefined && gnoValue !== undefined && psmValue !== gnoValue) {
        mismatches.push({
          commitment_id: commitmentId,
          field: alias,
          psm_value: psmValue,
          gno_value: gnoValue,
        });
      }
    });
  });
  
  // Log results
  if (mismatches.length > 0) {
    console.group('[VIEW MISMATCH REPORT]');
    console.log(`Project: ${projectId || 'ALL'}`);
    console.log(`Commitments in PSM: ${psmMap.size}`);
    console.log(`Commitments in GNO: ${gnoMap.size}`);
    console.log(`Mismatches found: ${mismatches.length}`);
    mismatches.forEach(m => {
      console.warn('[VIEW_MISMATCH]', m);
    });
    console.groupEnd();
  } else {
    console.log(`[VIEW CONSISTENCY] No mismatches found for project ${projectId || 'ALL'}`);
  }
  
  return {
    project_id: projectId,
    psm_count: psmMap.size,
    gno_count: gnoMap.size,
    mismatch_count: mismatches.length,
    mismatches,
  };
}

/**
 * Store for collecting diagnostic data across views
 * Used for cross-view comparison
 */
const diagnosticStore = {
  psm: new Map(), // projectId -> items
  gno: [], // all GNO items
};

export function storePSMDiagnostics(projectId, items) {
  if (process.env.NODE_ENV !== 'development') return;
  diagnosticStore.psm.set(projectId, items);
}

export function storeGNODiagnostics(items) {
  if (process.env.NODE_ENV !== 'development') return;
  diagnosticStore.gno = items;
}

export function runCrossViewComparison(projectId) {
  if (process.env.NODE_ENV !== 'development') return null;
  
  const psmItems = diagnosticStore.psm.get(projectId) || [];
  const gnoItems = diagnosticStore.gno;
  
  return compareViews(psmItems, gnoItems, projectId);
}

/**
 * Full diagnostic report - run both PSM and GNO diagnostics
 */
export function runFullDiagnosticReport(psmItems, gnoItems, projectId = null) {
  if (process.env.NODE_ENV !== 'development') return null;
  
  console.group('[FULL SUPPLY DIAGNOSTIC REPORT]');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Project ID:', projectId || 'N/A');
  
  const psmDiag = diagnoseSupplyItems(psmItems, 'useProjectSupplyView');
  const gnoDiag = diagnoseSupplyItems(gnoItems, 'useOpsSupplyView');
  const crossView = projectId ? compareViews(psmItems, gnoItems, projectId) : null;
  
  console.log('\n=== OVERALL SUMMARY ===');
  console.table({
    PSM: psmDiag?.summary || {},
    GNO: gnoDiag?.summary || {},
  });
  
  if (crossView) {
    console.log('\n=== CROSS-VIEW CONSISTENCY ===');
    console.log('Mismatches:', crossView.mismatch_count);
  }
  
  console.groupEnd();
  
  return {
    timestamp: new Date().toISOString(),
    project_id: projectId,
    psm: psmDiag,
    gno: gnoDiag,
    crossView,
  };
}