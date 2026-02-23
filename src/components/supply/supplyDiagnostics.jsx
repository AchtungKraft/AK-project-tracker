/**
 * SUPPLY INVENTORY DRIFT FORENSIC REPORT
 * 
 * SAFE / READ-ONLY / NO MUTATIONS / DIAGNOSTIC ONLY
 * 
 * This module provides comprehensive forensic analysis of supply read model drift.
 * 
 * DO NOT modify business logic.
 * DO NOT mutate data.
 * DO NOT normalize data.
 * DO NOT change routing.
 * DO NOT alter UI layout.
 * 
 * This is diagnostic only.
 */

// In-memory stores for cross-view comparison
const PSM_DIAGNOSTIC_STORE = new Map(); // projectId -> items[]
const GNO_DIAGNOSTIC_STORE = { items: [] };

// ============================================================================
// PHASE 1 — RAW INVENTORY SNAPSHOT REPORT
// ============================================================================

/**
 * Extract raw inventory inputs from a commitment item
 * Returns structured snapshot of ALL inventory-related fields
 */
function extractRawInventorySnapshot(item, sourceName) {
  const inv = item.inventory_snapshot || {};
  
  return {
    // Source identification
    source: sourceName,
    commitment_id: item.commitment_id || item.id,
    project_id: item.project_id,
    part_id: item.part_id,
    
    // Raw inventory inputs (as received from backend)
    physical_stock_global: inv.physical_stock_global ?? inv.physical_stock ?? inv.physical ?? null,
    reserved_global_active: inv.reserved_global_active ?? inv.reserved_global ?? inv.reserved_total ?? inv.reserved ?? null,
    reserved_this_project: inv.reserved_this_project ?? item.reserved_from_stock ?? null,
    on_order_global: inv.on_order_global ?? inv.on_order_total ?? null,
    available_reported: inv.available_global_active ?? inv.available ?? null,
    
    // Commitment demand fields
    required_total: item.required_total ?? 0,
    reserved_from_stock: item.reserved_from_stock ?? 0,
    covered_from_po: item.covered_from_po ?? 0,
    qty_installed: item.qty_installed ?? 0,
    
    // Canonical outputs (as returned by backend)
    coverage_status: item.coverage_status,
    gap_qty: item.gap_qty ?? item.to_order,
    to_order: item.to_order,
    available_install: item.available_to_install ?? item.available_install ?? null,
    
    // Additional context
    source_type: item.source_type ?? item.supply_source_type,
    billing_status: item.billing_status,
    commitment_status: item.commitment_status,
  };
}

/**
 * Compute derived values WITHOUT using backend computed fields
 * This allows us to detect drift between what backend sends vs what math should be
 */
function computeLocalValues(snapshot) {
  const physical = snapshot.physical_stock_global ?? 0;
  const reserved_global = snapshot.reserved_global_active ?? 0;
  const required = snapshot.required_total ?? 0;
  const reserved_stock = snapshot.reserved_from_stock ?? 0;
  const covered_po = snapshot.covered_from_po ?? 0;
  const installed = snapshot.qty_installed ?? 0;
  
  // Local computation of available
  const available_calculated = physical - reserved_global;
  
  // Local computation of gap (qty still needed)
  const gap_calculated = Math.max(0, required - reserved_stock - covered_po);
  
  // Local computation of coverage status
  const total_covered = reserved_stock + covered_po;
  let coverage_calculated;
  if (total_covered >= required && required > 0) {
    coverage_calculated = 'FULL';
  } else if (total_covered > 0 && total_covered < required) {
    coverage_calculated = 'PARTIAL';
  } else if (required > 0) {
    coverage_calculated = 'NONE';
  } else {
    coverage_calculated = 'N/A';
  }
  
  // Local computation of available to install
  const available_install_calculated = Math.max(0, reserved_stock + covered_po - installed);
  
  return {
    available_calculated,
    gap_calculated,
    coverage_calculated,
    available_install_calculated,
    total_covered,
  };
}

/**
 * Detect drift flags by comparing backend values to local calculations
 */
function detectDriftFlags(snapshot, computed) {
  const drifts = [];
  
  // AVAILABLE_DRIFT: available_calculated !== inventory_snapshot.available
  const availableReported = snapshot.available_reported ?? 0;
  if (Math.abs(availableReported - computed.available_calculated) > 0.001) {
    drifts.push({
      type: 'AVAILABLE_DRIFT',
      commitment_id: snapshot.commitment_id,
      part_id: snapshot.part_id,
      reported: availableReported,
      calculated: computed.available_calculated,
      delta: availableReported - computed.available_calculated,
      context: {
        physical: snapshot.physical_stock_global,
        reserved_global: snapshot.reserved_global_active,
      },
    });
  }
  
  // GAP_DRIFT: gap_calculated !== gap_qty
  const gapReported = snapshot.gap_qty ?? snapshot.to_order ?? 0;
  if (Math.abs(gapReported - computed.gap_calculated) > 0.001) {
    drifts.push({
      type: 'GAP_DRIFT',
      commitment_id: snapshot.commitment_id,
      part_id: snapshot.part_id,
      reported_gap: gapReported,
      calculated_gap: computed.gap_calculated,
      delta: gapReported - computed.gap_calculated,
      context: {
        required: snapshot.required_total,
        reserved_stock: snapshot.reserved_from_stock,
        covered_po: snapshot.covered_from_po,
      },
    });
  }
  
  // COVERAGE_DRIFT: coverage_status === "FULL" AND to_order > 0
  if (snapshot.coverage_status === 'FULL' && (snapshot.to_order ?? 0) > 0) {
    drifts.push({
      type: 'COVERAGE_DRIFT',
      subtype: 'FULL_BUT_TO_ORDER_POSITIVE',
      commitment_id: snapshot.commitment_id,
      part_id: snapshot.part_id,
      coverage_status: snapshot.coverage_status,
      to_order: snapshot.to_order,
    });
  }
  
  // COVERAGE_DRIFT: calculated FULL but reported not FULL
  if (computed.coverage_calculated === 'FULL' && snapshot.coverage_status !== 'FULL') {
    drifts.push({
      type: 'COVERAGE_DRIFT',
      subtype: 'SHOULD_BE_FULL',
      commitment_id: snapshot.commitment_id,
      part_id: snapshot.part_id,
      reported_coverage: snapshot.coverage_status,
      calculated_coverage: computed.coverage_calculated,
    });
  }
  
  // ORDERABLE_WHEN_COVERED: available_calculated >= required_total AND to_order > 0
  if (computed.available_calculated >= snapshot.required_total && 
      snapshot.required_total > 0 && 
      (snapshot.to_order ?? 0) > 0) {
    drifts.push({
      type: 'ORDERABLE_WHEN_COVERED',
      commitment_id: snapshot.commitment_id,
      part_id: snapshot.part_id,
      available_calculated: computed.available_calculated,
      required_total: snapshot.required_total,
      to_order: snapshot.to_order,
      issue: 'Inventory available to cover but still showing to_order > 0',
    });
  }
  
  // NEGATIVE VALUES
  if (computed.available_calculated < 0) {
    drifts.push({
      type: 'NEGATIVE_AVAILABLE',
      commitment_id: snapshot.commitment_id,
      part_id: snapshot.part_id,
      value: computed.available_calculated,
    });
  }
  if ((snapshot.to_order ?? 0) < 0) {
    drifts.push({
      type: 'NEGATIVE_TO_ORDER',
      commitment_id: snapshot.commitment_id,
      value: snapshot.to_order,
    });
  }
  
  return drifts;
}

/**
 * Run full diagnostic on a single commitment item
 */
export function diagnoseCommitment(item, sourceName = 'Unknown') {
  const snapshot = extractRawInventorySnapshot(item, sourceName);
  const computed = computeLocalValues(snapshot);
  const drifts = detectDriftFlags(snapshot, computed);
  
  return {
    source: sourceName,
    snapshot,
    computed,
    drifts,
    hasDrift: drifts.length > 0,
  };
}

/**
 * Run full diagnostic on array of commitment items
 */
export function diagnoseSupplyItems(items, sourceName = 'Unknown') {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const diagnostics = items.map(item => diagnoseCommitment(item, sourceName));
  
  // Build summary
  const summary = {
    source: sourceName,
    timestamp: new Date().toISOString(),
    total_commitments: items.length,
    drift_counts: {
      available_drift: 0,
      gap_drift: 0,
      coverage_drift: 0,
      orderable_when_covered: 0,
      negative_available: 0,
      negative_to_order: 0,
    },
    items_with_drift: 0,
    drift_rate_percent: 0,
  };
  
  diagnostics.forEach(d => {
    if (d.hasDrift) {
      summary.items_with_drift++;
    }
    d.drifts.forEach(drift => {
      if (drift.type === 'AVAILABLE_DRIFT') summary.drift_counts.available_drift++;
      if (drift.type === 'GAP_DRIFT') summary.drift_counts.gap_drift++;
      if (drift.type === 'COVERAGE_DRIFT') summary.drift_counts.coverage_drift++;
      if (drift.type === 'ORDERABLE_WHEN_COVERED') summary.drift_counts.orderable_when_covered++;
      if (drift.type === 'NEGATIVE_AVAILABLE') summary.drift_counts.negative_available++;
      if (drift.type === 'NEGATIVE_TO_ORDER') summary.drift_counts.negative_to_order++;
    });
  });
  
  summary.drift_rate_percent = items.length > 0 
    ? Math.round((summary.items_with_drift / items.length) * 100) 
    : 0;
  
  // Console logging
  console.group(`[SUPPLY FORENSIC] ${sourceName}`);
  console.log('📊 Summary:', summary);
  
  // Sample drifted items
  const driftedItems = diagnostics.filter(d => d.hasDrift).slice(0, 5);
  if (driftedItems.length > 0) {
    console.group('🚨 Sample Drift Cases');
    driftedItems.forEach(d => {
      console.warn('Commitment:', d.snapshot.commitment_id);
      console.log('  Snapshot:', d.snapshot);
      console.log('  Computed:', d.computed);
      console.log('  Drifts:', d.drifts);
    });
    console.groupEnd();
  }
  
  // Sample non-drifted for baseline
  if (diagnostics.length > 0) {
    console.log('📋 Sample Canonical Fields (first item):', diagnostics[0].snapshot);
    console.log('🧮 Sample Computed Fields (first item):', diagnostics[0].computed);
  }
  
  console.groupEnd();
  
  return {
    summary,
    diagnostics,
    driftedItems: diagnostics.filter(d => d.hasDrift),
  };
}

// ============================================================================
// PHASE 2 — CROSS VIEW COMPARISON
// ============================================================================

/**
 * Store PSM diagnostics for later cross-view comparison
 */
export function storePSMDiagnostics(projectId, items) {
  if (process.env.NODE_ENV !== 'development') return;
  PSM_DIAGNOSTIC_STORE.set(projectId, items);
}

/**
 * Store GNO diagnostics for later cross-view comparison
 */
export function storeGNODiagnostics(items) {
  if (process.env.NODE_ENV !== 'development') return;
  GNO_DIAGNOSTIC_STORE.items = items;
}

/**
 * Compare views for same commitment IDs
 */
export function compareViews(psmItems, gnoItems, targetProjectId = null) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const results = [];
  
  // Build maps by commitment_id
  const psmMap = new Map();
  psmItems.forEach(item => {
    const cid = item.commitment_id || item.id;
    if (!targetProjectId || item.project_id === targetProjectId) {
      psmMap.set(cid, item);
    }
  });
  
  const gnoMap = new Map();
  gnoItems.forEach(item => {
    const cid = item.commitment_id || item.id;
    if (!targetProjectId || item.project_id === targetProjectId) {
      gnoMap.set(cid, item);
    }
  });
  
  // Fields to compare
  const fieldsToCompare = [
    'required_total',
    'reserved_from_stock',
    'covered_from_po',
    'qty_installed',
    'to_order',
    'coverage_status',
    'inventory_snapshot.physical_stock_global',
    'inventory_snapshot.physical_stock',
    'inventory_snapshot.physical',
    'inventory_snapshot.reserved_global_active',
    'inventory_snapshot.reserved_global',
    'inventory_snapshot.reserved_total',
    'inventory_snapshot.reserved',
    'inventory_snapshot.available_global_active',
    'inventory_snapshot.available',
    'inventory_snapshot.on_order_global',
    'inventory_snapshot.on_order_total',
  ];
  
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  };
  
  // Compare all commitments in PSM
  psmMap.forEach((psmItem, commitmentId) => {
    const gnoItem = gnoMap.get(commitmentId);
    
    const comparison = {
      commitment_id: commitmentId,
      part_id: psmItem.part_id,
      project_id: psmItem.project_id,
      in_psm: true,
      in_gno: !!gnoItem,
      drift: false,
      drift_fields: [],
      psm_values: {},
      gno_values: {},
    };
    
    if (!gnoItem) {
      comparison.drift = true;
      comparison.drift_fields.push('MISSING_IN_GNO');
      results.push(comparison);
      return;
    }
    
    // Compare each field
    fieldsToCompare.forEach(field => {
      const psmVal = getNestedValue(psmItem, field);
      const gnoVal = getNestedValue(gnoItem, field);
      
      comparison.psm_values[field] = psmVal;
      comparison.gno_values[field] = gnoVal;
      
      // Only compare if at least one has the value
      if (psmVal !== undefined || gnoVal !== undefined) {
        // Numeric comparison with tolerance
        if (typeof psmVal === 'number' && typeof gnoVal === 'number') {
          if (Math.abs(psmVal - gnoVal) > 0.001) {
            comparison.drift = true;
            comparison.drift_fields.push({
              field,
              psm: psmVal,
              gno: gnoVal,
              delta: psmVal - gnoVal,
            });
          }
        } else if (psmVal !== gnoVal) {
          comparison.drift = true;
          comparison.drift_fields.push({
            field,
            psm: psmVal,
            gno: gnoVal,
          });
        }
      }
    });
    
    results.push(comparison);
  });
  
  // Check for items in GNO but not PSM
  gnoMap.forEach((gnoItem, commitmentId) => {
    if (!psmMap.has(commitmentId)) {
      results.push({
        commitment_id: commitmentId,
        part_id: gnoItem.part_id,
        project_id: gnoItem.project_id,
        in_psm: false,
        in_gno: true,
        drift: true,
        drift_fields: ['MISSING_IN_PSM'],
        psm_values: {},
        gno_values: {},
      });
    }
  });
  
  return results;
}

/**
 * Run cross-view comparison using stored data
 */
export function runCrossViewComparison(projectId) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  const psmItems = PSM_DIAGNOSTIC_STORE.get(projectId) || [];
  const gnoItems = GNO_DIAGNOSTIC_STORE.items || [];
  
  if (psmItems.length === 0 && gnoItems.length === 0) {
    console.warn('[CROSS-VIEW] No data stored. Load both views first.');
    return null;
  }
  
  const comparisons = compareViews(psmItems, gnoItems, projectId);
  const driftedItems = comparisons.filter(c => c.drift);
  
  const report = {
    project_id: projectId,
    timestamp: new Date().toISOString(),
    psm_item_count: psmItems.length,
    gno_item_count: gnoItems.length,
    total_compared: comparisons.length,
    cross_view_drift_count: driftedItems.length,
    drift_rate_percent: comparisons.length > 0 
      ? Math.round((driftedItems.length / comparisons.length) * 100) 
      : 0,
    drifted_commitments: driftedItems.slice(0, 10), // Sample
  };
  
  console.group('[CROSS-VIEW COMPARISON]');
  console.log('📊 Report:', report);
  if (driftedItems.length > 0) {
    console.warn('🚨 Drifted Items Sample:', driftedItems.slice(0, 5));
  }
  console.groupEnd();
  
  return report;
}

// ============================================================================
// PHASE 3 — INVENTORY SOURCE TRACE
// ============================================================================

/**
 * Trace inventory source chain for a commitment
 * Analyzes where inventory data comes from and potential filter issues
 */
export function traceInventorySource(item, sourceName) {
  const inv = item.inventory_snapshot || {};
  
  // Detect which inventory fields are populated
  const fieldPresence = {
    // Global physical
    has_physical_stock_global: inv.physical_stock_global !== undefined,
    has_physical_stock: inv.physical_stock !== undefined,
    has_physical: inv.physical !== undefined,
    
    // Global reserved
    has_reserved_global_active: inv.reserved_global_active !== undefined,
    has_reserved_global: inv.reserved_global !== undefined,
    has_reserved_total: inv.reserved_total !== undefined,
    has_reserved: inv.reserved !== undefined,
    
    // Available
    has_available_global_active: inv.available_global_active !== undefined,
    has_available: inv.available !== undefined,
    
    // On order
    has_on_order_global: inv.on_order_global !== undefined,
    has_on_order_total: inv.on_order_total !== undefined,
  };
  
  // Infer inventory query source based on field naming
  let inventory_query_source = 'UNKNOWN';
  let filters_applied = [];
  let grouping_logic = 'UNKNOWN';
  let includes_closed_commitments = null;
  
  if (fieldPresence.has_reserved_global_active) {
    inventory_query_source = 'PART_INVENTORY_MAP_WITH_ACTIVE_FILTER';
    filters_applied = ['commitment_status NOT IN (cancelled, closed)'];
    grouping_logic = 'SUM(reserved_from_stock) GROUP BY part_id';
    includes_closed_commitments = false;
  } else if (fieldPresence.has_reserved_global) {
    inventory_query_source = 'PART_INVENTORY_MAP_NO_FILTER';
    filters_applied = ['none'];
    grouping_logic = 'SUM(reserved_from_stock) GROUP BY part_id';
    includes_closed_commitments = true;
  } else if (fieldPresence.has_reserved_total) {
    inventory_query_source = 'PART_ENTITY_FIELD';
    filters_applied = ['derived from Part.allocated_stock'];
    grouping_logic = 'Part entity field';
    includes_closed_commitments = null; // Unknown
  } else if (fieldPresence.has_reserved) {
    inventory_query_source = 'LEGACY_SIMPLE_SNAPSHOT';
    filters_applied = ['UNKNOWN'];
    grouping_logic = 'UNKNOWN';
    includes_closed_commitments = null;
  }
  
  return {
    commitment_id: item.commitment_id || item.id,
    part_id: item.part_id,
    source: sourceName,
    inventory_query_source,
    filters_applied,
    grouping_logic,
    includes_closed_commitments,
    field_presence: fieldPresence,
    raw_inventory_snapshot: inv,
  };
}

/**
 * Analyze inventory source patterns across all items
 */
export function analyzeInventorySources(items, sourceName) {
  if (process.env.NODE_ENV !== 'development') return null;
  
  const traces = items.map(item => traceInventorySource(item, sourceName));
  
  // Group by query source
  const sourceGroups = {};
  traces.forEach(t => {
    const src = t.inventory_query_source;
    if (!sourceGroups[src]) {
      sourceGroups[src] = { count: 0, sample: null };
    }
    sourceGroups[src].count++;
    if (!sourceGroups[src].sample) {
      sourceGroups[src].sample = t;
    }
  });
  
  const report = {
    source: sourceName,
    total_items: items.length,
    inventory_source_breakdown: sourceGroups,
    mixed_sources: Object.keys(sourceGroups).length > 1,
  };
  
  console.group('[INVENTORY SOURCE TRACE]');
  console.log('📊 Report:', report);
  if (report.mixed_sources) {
    console.warn('⚠️ MIXED INVENTORY SOURCES DETECTED - potential inconsistency');
  }
  console.groupEnd();
  
  return report;
}

// ============================================================================
// PHASE 4 — UI MAPPING TRACE
// ============================================================================

/**
 * Document which fields GNO and PSM actually render
 */
export function getUIFieldMapping() {
  return {
    GlobalNeedToOrder: {
      in_stock_display: {
        field_used: 'inventory_snapshot.available OR inventory_snapshot.physical_stock',
        notes: 'Check GlobalNeedToOrder.jsx for actual field reference',
      },
      to_order_display: {
        field_used: 'to_order OR gap_qty',
        notes: 'Canonical field from view model',
      },
      coverage_badge: {
        field_used: 'coverage_status',
        notes: 'FULL/PARTIAL/NONE',
      },
    },
    ProjectSupplyManager: {
      in_stock_display: {
        field_used: 'inventory_snapshot.available_global_active OR inventory_snapshot.available',
        notes: 'Check PSMGroupedCards.jsx for actual field reference',
      },
      reserved_display: {
        field_used: 'reserved_from_stock',
        notes: 'Commitment-level reservation',
      },
      gap_display: {
        field_used: 'to_order OR gap_qty OR coverage.gap_qty',
        notes: 'Multiple possible sources',
      },
    },
    potential_divergence_points: [
      'inventory_snapshot field naming differs between views',
      'available calculation differs (global vs project-scoped)',
      'reserved aggregation differs (this project vs all projects)',
    ],
  };
}

// ============================================================================
// FULL DIAGNOSTIC REPORT
// ============================================================================

/**
 * Run complete forensic diagnostic report
 */
export function runFullDiagnosticReport(psmItems, gnoItems, projectId) {
  if (process.env.NODE_ENV !== 'development') {
    console.warn('[DIAGNOSTIC] Disabled in production');
    return null;
  }
  
  console.group('═══════════════════════════════════════════════════════════════');
  console.log('SUPPLY INVENTORY DRIFT FORENSIC REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Phase 1: Raw inventory snapshot
  console.group('PHASE 1 — RAW INVENTORY SNAPSHOT REPORT');
  const psmDiag = diagnoseSupplyItems(psmItems, 'ProjectSupplyView');
  const gnoDiag = diagnoseSupplyItems(gnoItems, 'OpsSupplyView');
  console.groupEnd();
  
  // Phase 2: Cross-view comparison
  console.group('PHASE 2 — CROSS VIEW COMPARISON');
  const crossView = compareViews(psmItems, gnoItems, projectId);
  const crossViewDrifted = crossView?.filter(c => c.drift) || [];
  console.log(`Total compared: ${crossView?.length || 0}`);
  console.log(`Cross-view drift count: ${crossViewDrifted.length}`);
  if (crossViewDrifted.length > 0) {
    console.warn('Sample drifted:', crossViewDrifted.slice(0, 3));
  }
  console.groupEnd();
  
  // Phase 3: Inventory source trace
  console.group('PHASE 3 — INVENTORY SOURCE TRACE');
  const psmSources = analyzeInventorySources(psmItems, 'ProjectSupplyView');
  const gnoSources = analyzeInventorySources(gnoItems, 'OpsSupplyView');
  console.groupEnd();
  
  // Phase 4: UI mapping
  console.group('PHASE 4 — UI MAPPING TRACE');
  const uiMapping = getUIFieldMapping();
  console.log('UI Field Mapping:', uiMapping);
  console.groupEnd();
  
  // Build final report
  const report = {
    timestamp: new Date().toISOString(),
    project_id: projectId,
    
    total_commitments_checked: (psmItems?.length || 0) + (gnoItems?.length || 0),
    
    drift_count: {
      psm: psmDiag?.summary?.items_with_drift || 0,
      gno: gnoDiag?.summary?.items_with_drift || 0,
      cross_view: crossViewDrifted.length,
    },
    
    drift_summary: {
      available_drift: (psmDiag?.summary?.drift_counts?.available_drift || 0) + 
                       (gnoDiag?.summary?.drift_counts?.available_drift || 0),
      gap_drift: (psmDiag?.summary?.drift_counts?.gap_drift || 0) + 
                 (gnoDiag?.summary?.drift_counts?.gap_drift || 0),
      coverage_drift: (psmDiag?.summary?.drift_counts?.coverage_drift || 0) + 
                      (gnoDiag?.summary?.drift_counts?.coverage_drift || 0),
      orderable_when_covered: (psmDiag?.summary?.drift_counts?.orderable_when_covered || 0) + 
                              (gnoDiag?.summary?.drift_counts?.orderable_when_covered || 0),
      cross_view_drift: crossViewDrifted.length,
    },
    
    sample_drift_cases: {
      psm: psmDiag?.driftedItems?.slice(0, 3) || [],
      gno: gnoDiag?.driftedItems?.slice(0, 3) || [],
      cross_view: crossViewDrifted.slice(0, 3),
    },
    
    inventory_query_source_summary: {
      psm: psmSources?.inventory_source_breakdown || {},
      gno: gnoSources?.inventory_source_breakdown || {},
    },
    
    ui_field_mapping: uiMapping,
    
    recommendations: generateRecommendations(psmDiag, gnoDiag, crossViewDrifted, psmSources, gnoSources),
  };
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('FINAL REPORT:', JSON.stringify(report, null, 2));
  console.log('═══════════════════════════════════════════════════════════════');
  console.groupEnd();
  
  return report;
}

/**
 * Generate actionable recommendations based on drift analysis
 */
function generateRecommendations(psmDiag, gnoDiag, crossViewDrifted, psmSources, gnoSources) {
  const recommendations = [];
  
  // Check for available drift
  const availableDrift = (psmDiag?.summary?.drift_counts?.available_drift || 0) + 
                         (gnoDiag?.summary?.drift_counts?.available_drift || 0);
  if (availableDrift > 0) {
    recommendations.push({
      issue: 'AVAILABLE_DRIFT_DETECTED',
      count: availableDrift,
      likely_cause: 'Inventory aggregation filtering differs - check if closed commitments are included',
      action: 'Verify reserved_global_active calculation in both backend functions',
    });
  }
  
  // Check for gap drift
  const gapDrift = (psmDiag?.summary?.drift_counts?.gap_drift || 0) + 
                   (gnoDiag?.summary?.drift_counts?.gap_drift || 0);
  if (gapDrift > 0) {
    recommendations.push({
      issue: 'GAP_DRIFT_DETECTED',
      count: gapDrift,
      likely_cause: 'to_order calculation differs from (required - reserved - covered)',
      action: 'Check frontend hook normalization vs backend calculation',
    });
  }
  
  // Check for cross-view drift
  if (crossViewDrifted.length > 0) {
    recommendations.push({
      issue: 'CROSS_VIEW_DRIFT_DETECTED',
      count: crossViewDrifted.length,
      likely_cause: 'PSM and GNO use different inventory snapshot schemas',
      action: 'Unify inventory_snapshot field naming between getProjectSupplyView and getOpsSupplyView',
    });
  }
  
  // Check for mixed inventory sources
  if (psmSources?.mixed_sources || gnoSources?.mixed_sources) {
    recommendations.push({
      issue: 'MIXED_INVENTORY_SOURCES',
      likely_cause: 'Different commitment items use different inventory query patterns',
      action: 'Standardize on single inventory aggregation approach',
    });
  }
  
  // Check for orderable when covered
  const orderableWhenCovered = (psmDiag?.summary?.drift_counts?.orderable_when_covered || 0) + 
                                (gnoDiag?.summary?.drift_counts?.orderable_when_covered || 0);
  if (orderableWhenCovered > 0) {
    recommendations.push({
      issue: 'ORDERABLE_WHEN_FULLY_COVERED',
      count: orderableWhenCovered,
      likely_cause: 'Coverage status not properly enforcing procurement guard',
      action: 'Verify coverage_status === FULL blocks ordering in both views',
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      issue: 'NO_DRIFT_DETECTED',
      action: 'Supply model appears consistent - continue monitoring',
    });
  }
  
  return recommendations;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  extractRawInventorySnapshot,
  computeLocalValues,
  detectDriftFlags,
  traceInventorySource,
  analyzeInventorySources,
  getUIFieldMapping,
};