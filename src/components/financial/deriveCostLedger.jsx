/**
 * deriveCostLedger — CANONICAL cost resolver
 *
 * THREE distinct cost concepts that must NEVER be blended:
 *
 * 1. PLANNED COST — Expected total project cost from estimates/projections.
 *    Sum of all commitment costs at their full required quantities.
 *
 * 2. OPERATIONAL COST — Real-world cost incurred when work was performed.
 *    Parts: cost at the moment of RECEIVING (part entered inventory for this project).
 *    Services: cost when work was COMPLETED or ORDERED (vendor engaged).
 *    This is true operational spend regardless of accounting status.
 *
 * 3. ACCOUNTING COST — Cost formally recognized in accounting ledger.
 *    Based on vendor invoices received, AP entries, payments recorded.
 *    Currently approximated as: parts received/installed cost + services billed cost.
 *    This may lag operational cost.
 *
 * ACTUALIZATION RULES:
 *   Parts:  operational cost when RECEIVED (not ordered, not installed, not billed)
 *   Services: operational cost when COMPLETED or BILLED (work performed)
 *   Services ordered: committed but NOT yet operational cost
 *
 * ACCOUNTING RULES:
 *   Parts: accounting cost when vendor invoice recorded (approx: received + installed)
 *   Services: accounting cost when BILLED (AP/invoice entered)
 */

/**
 * @param {Object} params
 * @param {Array} params.enrichedCommitments - Part commitments from supply view
 * @param {Object} params.servicesSummary - Services summary from getServicesView
 * @returns {Object} Canonical cost ledger
 */
export function deriveCostLedger({ enrichedCommitments = [], servicesSummary = {} }) {
  // ═══════════════════════════════════════════════════════════════
  // PARTS — per-unit cost × quantity in each lifecycle state
  // ═══════════════════════════════════════════════════════════════
  let partsPlannedCost = 0;
  let partsOperationalCost = 0;    // received + installed
  let partsAccountingCost = 0;     // vendor invoice approximation
  let partsCostInstalled = 0;
  let partsCostReceived = 0;
  let partsCostOnPO = 0;
  let partsCostUnordered = 0;

  const partsProvenance = [];

  for (const c of enrichedCommitments) {
    const uc = c.unit_cost ?? 0;
    const effReq = c.effective_required ?? c.required_total ?? 0;
    const reserved = c.reserved_from_stock ?? 0;
    const installed = c.qty_installed ?? 0;
    const coveredPO = c.covered_from_po ?? 0;
    const toOrder = c.to_order_qty ?? c.to_order ?? 0;

    const plannedTotal = effReq * uc;
    const installedCost = installed * uc;
    const receivedNotInstalled = Math.max(0, reserved - installed);
    const receivedCost = receivedNotInstalled * uc;
    const onPOCost = coveredPO * uc;
    const unorderedCost = toOrder * uc;

    partsPlannedCost += plannedTotal;
    partsCostInstalled += installedCost;
    partsCostReceived += receivedCost;
    partsCostOnPO += onPOCost;
    partsCostUnordered += unorderedCost;

    // OPERATIONAL: cost incurred when part was received into project inventory
    // Both received-not-installed AND installed count as operational
    const operationalForItem = installedCost + receivedCost;
    partsOperationalCost += operationalForItem;

    // ACCOUNTING: approximated as same as operational for parts
    // (vendor invoice typically recorded at/near receiving)
    partsAccountingCost += operationalForItem;

    if (uc > 0 && effReq > 0) {
      partsProvenance.push({
        id: c.commitment_id || c.id,
        name: c.part?.part_name || c.part_name || 'Unknown',
        planned: plannedTotal,
        operational: operationalForItem,
        accounting: operationalForItem,
        trigger: installed > 0 ? 'installed' : reserved > 0 ? 'received' : coveredPO > 0 ? 'on_po' : 'unordered',
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SERVICES — CANONICAL per-status cost from backend summary
  // Uses actual $ totals per status bucket, NOT count-based pro-rating
  // ═══════════════════════════════════════════════════════════════
  const svc = servicesSummary || {};
  const costByStatus = svc.cost_by_status || {};

  // Total planned = sum of all service costs regardless of status
  const servicesPlannedCost = svc.total_cost ?? 0;

  // Per-status cost totals (actual $ from line items, not pro-rated)
  const svcCostPlanned = costByStatus.planned ?? 0;
  const svcCostOrdered = costByStatus.ordered ?? 0;
  const svcCostCompleted = costByStatus.completed ?? 0;
  const svcCostBilled = costByStatus.billed ?? 0;

  // FALLBACK: If backend doesn't have cost_by_status yet, use count pro-rating
  const hasCostByStatus = (svcCostPlanned + svcCostOrdered + svcCostCompleted + svcCostBilled) > 0
    || servicesPlannedCost === 0;

  let servicesOperationalCost, servicesAccountingCost;
  let svcOperationalBreakdown;

  if (hasCostByStatus) {
    // CANONICAL: completed + billed = operational
    servicesOperationalCost = svcCostCompleted + svcCostBilled;
    // CANONICAL: only billed = accounting (vendor invoice/AP recognized)
    servicesAccountingCost = svcCostBilled;
    svcOperationalBreakdown = {
      completed: svcCostCompleted,
      billed: svcCostBilled,
      ordered: svcCostOrdered,
      planned: svcCostPlanned,
      source: 'cost_by_status',
    };
  } else {
    // LEGACY FALLBACK: pro-rate by count (will be inaccurate for mixed-cost services)
    const totalCount = svc.total ?? 0;
    const byStatus = svc.by_status || {};
    const ratio = (n) => totalCount > 0 ? n / totalCount : 0;
    const completedCost = servicesPlannedCost * ratio(byStatus.completed ?? 0);
    const billedCost = servicesPlannedCost * ratio(byStatus.billed ?? 0);
    const orderedCost = servicesPlannedCost * ratio(byStatus.ordered ?? 0);
    const plannedOnlyCost = servicesPlannedCost * ratio(byStatus.planned ?? 0);

    servicesOperationalCost = completedCost + billedCost;
    servicesAccountingCost = billedCost;
    svcOperationalBreakdown = {
      completed: completedCost,
      billed: billedCost,
      ordered: orderedCost,
      planned: plannedOnlyCost,
      source: 'count_pro_rated_LEGACY',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // TOTALS — Three distinct cost layers
  // ═══════════════════════════════════════════════════════════════
  const plannedCost = partsPlannedCost + servicesPlannedCost;
  const operationalCost = partsOperationalCost + servicesOperationalCost;
  const accountingCost = partsAccountingCost + servicesAccountingCost;

  // Derived metrics
  // NOTE: This compares operational vs accounting cost layers (internal cost tracking).
  // NOT related to client billing. For client-facing "unbilled" see billingLedger.
  const uninvoicedOperationalCost = Math.max(0, operationalCost - accountingCost);
  const uncommittedCost = partsCostUnordered + (svcOperationalBreakdown.planned ?? 0);
  const committedNotOperational = partsCostOnPO + (svcOperationalBreakdown.ordered ?? 0);

  // ═══════════════════════════════════════════════════════════════
  // RECONCILIATION — every $ in exactly one bucket
  // ═══════════════════════════════════════════════════════════════
  const partsBucketSum = partsCostInstalled + partsCostReceived + partsCostOnPO + partsCostUnordered;
  const svcBucketSum = (svcOperationalBreakdown.completed ?? 0) +
    (svcOperationalBreakdown.billed ?? 0) +
    (svcOperationalBreakdown.ordered ?? 0) +
    (svcOperationalBreakdown.planned ?? 0);

  const totalBucketSum = operationalCost + committedNotOperational + uncommittedCost;
  const totalBucketDrift = Math.abs(totalBucketSum - plannedCost);

  if (typeof window !== 'undefined' && localStorage.getItem('ak_debug_coverage') === 'true') {
    console.groupCollapsed('[COST LEDGER] Canonical 3-Layer Costs');
    console.table({
      '📦 Parts Planned': Math.round(partsPlannedCost),
      '📦 Parts Operational': Math.round(partsOperationalCost),
      '📦 Parts Accounting': Math.round(partsAccountingCost),
      '📦 Parts OnPO': Math.round(partsCostOnPO),
      '📦 Parts Unordered': Math.round(partsCostUnordered),
      '📦 Parts Bucket Sum': Math.round(partsBucketSum),
      '📦 Parts Drift': Math.abs(partsBucketSum - partsPlannedCost).toFixed(2),
    });
    console.table({
      '🔧 Svc Planned': Math.round(servicesPlannedCost),
      '🔧 Svc Operational': Math.round(servicesOperationalCost),
      '🔧 Svc Accounting': Math.round(servicesAccountingCost),
      '🔧 Svc Source': svcOperationalBreakdown.source,
      '🔧 Svc Completed $': Math.round(svcOperationalBreakdown.completed ?? 0),
      '🔧 Svc Billed $': Math.round(svcOperationalBreakdown.billed ?? 0),
      '🔧 Svc Ordered $': Math.round(svcOperationalBreakdown.ordered ?? 0),
      '🔧 Svc Planned-only $': Math.round(svcOperationalBreakdown.planned ?? 0),
    });
    console.table({
      '📊 Total Planned': Math.round(plannedCost),
      '📊 Total Operational': Math.round(operationalCost),
      '📊 Total Accounting': Math.round(accountingCost),
      '📊 Uninvoiced Op Cost': Math.round(uninvoicedOperationalCost),
      '📊 Committed Not Op': Math.round(committedNotOperational),
      '📊 Uncommitted': Math.round(uncommittedCost),
      '📊 Bucket Drift': totalBucketDrift.toFixed(2),
    });
    console.groupEnd();
    if (totalBucketDrift > 1) {
      console.warn(`[COST LEDGER] Bucket exclusivity drift: $${totalBucketDrift.toFixed(2)}`);
    }
  }

  return {
    // ── Three canonical cost layers ──
    plannedCost,
    operationalCost,
    accountingCost,

    // ── Per-domain breakdown ──
    parts: {
      plannedCost: partsPlannedCost,
      operationalCost: partsOperationalCost,
      accountingCost: partsAccountingCost,
      costInstalled: partsCostInstalled,
      costReceived: partsCostReceived,
      costOnPO: partsCostOnPO,
      costUnordered: partsCostUnordered,
    },
    services: {
      plannedCost: servicesPlannedCost,
      operationalCost: servicesOperationalCost,
      accountingCost: servicesAccountingCost,
      breakdown: svcOperationalBreakdown,
    },

    // ── Exposure buckets (each $ in exactly ONE) ──
    exposure: {
      operational: operationalCost,           // cost incurred
      committed: committedNotOperational,     // PO/ordered, not yet operational
      uncommitted: uncommittedCost,           // planned only, no vendor engagement
    },

    // ── Risk ──
    risk: {
      uninvoicedOperationalCost,              // operational cost not yet in accounting
      uncommittedCost,                        // no vendor engagement yet
    },

    // ── Reconciliation ──
    _reconciliation: {
      partsBucketSum,
      partsDrift: Math.abs(partsBucketSum - partsPlannedCost),
      svcBucketSum,
      svcDrift: Math.abs(svcBucketSum - servicesPlannedCost),
      totalBucketSum,
      totalBucketDrift,
      svcSource: svcOperationalBreakdown.source,
    },

    // ── Provenance (for diagnostics) ──
    _provenance: {
      parts: partsProvenance,
      svcBreakdown: svcOperationalBreakdown,
    },
  };
}