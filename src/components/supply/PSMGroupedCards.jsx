import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown, ChevronUp, MoreVertical, ShoppingCart, Package,
  Wrench, Plus, Edit, Trash2, X, AlertTriangle, CheckCircle2,
  ArrowUpDown, Layers, ExternalLink, DollarSign, RefreshCw
} from "lucide-react";
import CostSourceBadge from "@/components/supply/CostSourceBadge";
import resolveDefaultVendor from "@/components/supply/resolveDefaultVendor";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";
import { InventoryStateBadgeSimple, getInventoryStateCounts } from "./InventoryStateBadgeSimple";
import { NextActionBadgeInline } from "./CommitmentNextAction";
import PricingIntegrityBadge from "@/components/supply/PricingIntegrityBadge";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { resolveVendorDisplay, resolveCategoryDisplay } from "@/components/supply/supplyResolvers";
import { getDisplayStatus, getDisplayStatusColor } from "@/components/supply/lifecycleDisplay";
import { resolveLifecycleState, getLifecycleLabel, getLifecycleColor } from "./resolveCommitmentStateLocal";
import ExecutionDataBlock from "./ExecutionDataBlock";
import CoverageDebugPanel from "./CoverageDebugPanel";
import EffectiveQtyBadge, { IntegrityViolationBadge } from "./EffectiveQtyBadge";

/**
 * PSMGroupedCards - Build Management Optimized UI
 * 
 * ORDERING CONTEXT RULE:
 * In tab='buy', ALL UI elements (badges, buttons, labels) are driven ONLY by:
 * - to_order + coverage_status
 * Stock/reserved fields are informational ONLY — install actions MUST NOT appear if to_order > 0
 *
 * REFACTORED FOR:
 * - Context-aware rendering (ordering vs install vs plan)
 * - Compact horizontal metrics
 * - Collapsible ExecutionDataBlock
 * - Sorting within groups
 * - Inventory state clarity
 */

// Group color mapping
const GROUP_COLORS = {
  vendor: '#3B82F6',      // Blue
  category: '#6B7280',    // Gray
  inventory: {
    IN_STOCK: '#10B981',      // Emerald
    ORDERED: '#9333EA',       // Purple
    NEEDS_ORDER: '#EF4444',   // Red
    // Legacy aliases
    PARTIAL_STOCK: '#9333EA',
    OUT_OF_STOCK: '#EF4444',
  }
};

// Sort options
const SORT_OPTIONS = [
  { value: 'cost_at_risk_desc', label: 'Cost at Risk (High → Low)' },
  { value: 'margin_desc', label: 'Margin (High → Low)' },
  { value: 'retail_desc', label: 'Revenue (High → Low)' },
  { value: 'required_desc', label: 'Qty Required (High → Low)' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'to_order_desc', label: 'To Order (High → Low)' },
];

// Apply sorting to items — CANONICAL: cost_at_risk is the single exposure definition
function applySorting(items, sortMode) {
  const sorted = [...items];
  switch (sortMode) {
    case 'cost_at_risk_desc':
      return sorted.sort((a, b) => (b.cost_at_risk ?? b.resolved_exposure ?? 0) - (a.cost_at_risk ?? a.resolved_exposure ?? 0));
    case 'margin_desc':
      return sorted.sort((a, b) => (b.resolved_margin ?? 0) - (a.resolved_margin ?? 0));
    case 'retail_desc':
      return sorted.sort((a, b) => (b.planned_retail_total ?? 0) - (a.planned_retail_total ?? 0));
    case 'required_desc':
      return sorted.sort((a, b) => (b.required_total ?? 0) - (a.required_total ?? 0));
    case 'to_order_desc':
      return sorted.sort((a, b) => (b.to_order ?? 0) - (a.to_order ?? 0));
    case 'alphabetical':
      return sorted.sort((a, b) => (a.part?.part_name || '').localeCompare(b.part?.part_name || ''));
    default:
      return sorted;
  }
}

/**
 * PSMSummaryStrip - PHASE 6: Inventory clarity focused
 */
export function PSMSummaryStrip({ items, tab }) {
  const isOrderingContext = tab === 'buy';
  const stats = useMemo(() => {
    const totalItems = items.length;
    // CANONICAL: cost_at_risk = max(0, planned_cost - invoiced_amount)
    const totalExposure = items.reduce((sum, i) => sum + (i.cost_at_risk ?? i.resolved_exposure ?? 0), 0);
    const inventoryCounts = getInventoryStateCounts(items, isOrderingContext);
    
    const installReadyCount = items.filter(i => 
      (i.available_to_install ?? 0) > 0 && i.allowed?.canInstall
    ).length;
    
    const blockedCount = items.filter(i => i.block_reason_code).length;

    return { 
      totalItems, 
      totalExposure, 
      installReadyCount, 
      blockedCount,
      ...inventoryCounts 
    };
  }, [items, tab]);

  // ORDERING CONTEXT: Show procurement-relevant cards instead of inventory cards
  if (isOrderingContext) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4">
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Items</p>
            <p className="text-lg font-bold text-white">{stats.totalItems}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-red-900/50">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Needs Order</p>
            <p className={cn(
              "text-lg font-bold",
              stats.needsOrder > 0 ? "text-red-400" : "text-gray-500"
            )}>
              {stats.needsOrder}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-purple-900/50">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Ordered</p>
            <p className={cn(
              "text-lg font-bold",
              stats.ordered > 0 ? "text-purple-400" : "text-gray-500"
            )}>
              {stats.ordered}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-emerald-900/50">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Covered</p>
            <p className={cn(
              "text-lg font-bold",
              stats.inStock > 0 ? "text-emerald-400" : "text-gray-500"
            )}>
              {stats.inStock}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-amber-900/50">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Cost at Risk</p>
            <p className={cn(
              "text-lg font-bold font-mono",
              stats.totalExposure > 0 ? "text-amber-400" : "text-gray-500"
            )}>
              {formatCurrencyUSD(stats.totalExposure)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Items</p>
          <p className="text-lg font-bold text-white">{stats.totalItems}</p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-emerald-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">In Stock</p>
          <p className="text-lg font-bold text-emerald-400">{stats.inStock}</p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-purple-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Ordered</p>
          <p className={cn(
            "text-lg font-bold",
            stats.ordered > 0 ? "text-purple-400" : "text-gray-500"
          )}>
            {stats.ordered}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-red-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Needs Order</p>
          <p className={cn(
            "text-lg font-bold",
            stats.needsOrder > 0 ? "text-red-400" : "text-gray-500"
          )}>
            {stats.needsOrder}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-blue-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Install Ready</p>
          <p className={cn(
            "text-lg font-bold",
            stats.installReadyCount > 0 ? "text-blue-400" : "text-gray-500"
          )}>
            {stats.installReadyCount}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-amber-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Cost at Risk</p>
          <p className={cn(
            "text-lg font-bold font-mono",
            stats.totalExposure > 0 ? "text-amber-400" : "text-gray-500"
          )}>
            {formatCurrencyUSD(stats.totalExposure)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * PSMItemRow - PHASE 3: Compact horizontal layout with collapsible details
 */
export function PSMItemRow({
  commitment,
  isSelected,
  onSelect,
  onPartClick,
  onCreatePO,
  onReceive,
  onInstall,
  onReverseInstall,
  onDeltaOrder,
  onManageQty,
  onCancel,
  onRemoveCredit,
  onEditPricing,
  onSyncCost,
  actionsEnabled = true,
  categoriesMap,
  vendorsMap,
  tab = 'plan',
}) {
  const navigate = useNavigate();
  // PHASE 4: Collapsible execution detail
  const [showDetails, setShowDetails] = useState(false);
  
  const { part, vendor, allowed, categoryObj } = commitment;

  // ORDERING CONTEXT: Determines which UI elements are shown
  const isOrderingContext = tab === 'buy';

  // RESOLVER-FIRST: Derive display from canonical fields, not stored status
  const displayStatus = getLifecycleLabel(commitment);
  const statusColor = getLifecycleColor(commitment);

  // CANONICAL inventory values
  const inv = commitment.inventory_snapshot || {};
  const reservedProject = inv.reserved_this_project ?? commitment.reserved_from_stock ?? 0;
  const toOrder = commitment.to_order ?? 0;
  const available = inv.available_global_active ?? inv.available ?? 0;

  // Resolve names

  // CANONICAL: cost_at_risk = max(0, actual_cost - invoiced_amount)
  const costExposure = commitment.cost_at_risk ?? commitment.resolved_exposure ?? 0;
  // PLANNED vs ACTUAL
  const actualMargin = commitment.actual_margin ?? commitment.resolved_margin ?? 0;
  const plannedMargin = commitment.planned_margin ?? 0;
  const marginDelta = commitment.margin_delta ?? (actualMargin - plannedMargin);

  // CANONICAL: Resolve vendor display using source-first resolution
  const canonicalVendor = resolveDefaultVendor(commitment, null, {});
  const resolvedVendor = resolveVendorDisplay(
    canonicalVendor?.vendor_id || commitment.vendor?.id || vendor?.id,
    canonicalVendor?.vendor_name || vendor || commitment.vendor_name,
    vendorsMap
  );
  const resolvedCategory = resolveCategoryDisplay(
    commitment.categoryId,
    categoryObj || commitment.categoryName,
    categoriesMap
  );

  // Dev: detect conflicting UI state and coverage drift
  if (import.meta.env.DEV) {
    // PHASE 8: Debug output for every Needs Order row
    if (commitment.needs_order === true || toOrder > 0) {
      console.log('[NEEDS_ORDER DEBUG]', {
        name: part?.part_name,
        required_total: commitment.required_total,
        qty_removed: commitment.qty_removed ?? 0,
        effective_required: commitment.effective_required,
        reserved_from_stock: commitment.reserved_from_stock,
        covered_from_po: commitment.covered_from_po,
        qty_installed: commitment.qty_installed,
        coverage_qty: commitment.coverage_qty,
        to_order_qty: commitment.to_order_qty,
        needs_order: commitment.needs_order,
        commitment_fulfilled: commitment.commitment_fulfilled,
        next_action: commitment.next_action,
      });
    }
    // PHASE 8: ASSERTION — if item appears in Needs Order context but needs_order=false, flag it
    if (isOrderingContext && commitment.needs_order !== true) {
      console.error('[NEEDS_ORDER VIOLATION] Item in buy tab but needs_order !== true:', {
        name: part?.part_name,
        needs_order: commitment.needs_order,
        commitment_fulfilled: commitment.commitment_fulfilled,
        to_order: toOrder,
        coverage_qty: commitment.coverage_qty,
        effective_required: commitment.effective_required,
      });
    }
    // Coverage drift detection
    if (commitment._coverage_debug?.drift) {
      console.error('[COVERAGE DRIFT]', {
        part: part?.part_name,
        ...commitment._coverage_debug,
      });
    }
    // Ordering context conflict detection
    if (isOrderingContext) {
      const stock = commitment.reserved_from_stock ?? 0;
      if (stock > 0 && toOrder > 0) {
        console.error('[UI CONFLICT BLOCKED] stock-driven UI leaking into ordering context', {
          part: part?.part_name,
          stock,
          to_order: toOrder,
          coverage: commitment.coverage_status,
        });
      }
    }
  }

  // ORDERING CONTEXT: Suppress install actions when to_order > 0
  const hideInstallActions = isOrderingContext && toOrder > 0;

  // PHASE 5: canOrder is STRICTLY gated by backend needs_order flag
  // If needs_order !== true, Create PO is hidden regardless of local state
  const canOrder = allowed?.canCreatePO && commitment.needs_order === true;
  
  // CANONICAL: Invoice eligibility - use canCreateInvoice from getAllowedCommitmentActions
  const canInvoice = allowed?.canCreateInvoice ?? false;
  const invoiceBlockReason = commitment.invoice_block_reason_text;
  const billingState = commitment.billing_state || 'NOT_INVOICED';

  // PHASE 2: Install Eligibility Debug Trace (dev only)
  if (import.meta.env.DEV && part?.part_name?.includes('Air Conditioning')) {
    console.log("INSTALL DEBUG - A/C Part", {
      part: part?.part_name,
      reserved_from_stock: commitment.reserved_from_stock,
      qty_installed: commitment.qty_installed,
      available_to_install: commitment.available_to_install,
      allowedInstall: allowed?.canInstall,
      allowedCreateInvoice: allowed?.canCreateInvoice,
      block_reason_code: commitment.block_reason_code,
      actionsEnabled,
      inventory_snapshot: commitment.inventory_snapshot,
    });
  }
  
  // TRACE: Debug specific commitment 699bcdbc64c5d88332d0e0c7 (Heating Pipe)
  if (commitment.id === '699bcdbc64c5d88332d0e0c7' || commitment.commitment_id === '699bcdbc64c5d88332d0e0c7') {
    console.log("🔍 ROW DEBUG - Heating Pipe", commitment.id, {
      required_total: commitment.required_total,
      invoiced_qty: commitment.invoiced_qty,
      reserved_from_stock: commitment.reserved_from_stock,
      qty_installed: commitment.qty_installed,
      actionsEnabled,
      allowed,
      canInvoice,
      canOrder,
      billingState,
    });
  }

  return (
    <div className={cn(
      "hover:bg-gray-800/30 transition-colors border-b border-gray-800/50 last:border-b-0",
      commitment.block_reason_code && "opacity-60"
    )}>
      {/* Main Row - PHASE 3: Horizontal compact layout */}
      <div className="flex items-center gap-2 p-2 md:p-3">
        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          disabled={!allowed?.canCreatePO}
          className="flex-shrink-0"
        />

        {/* Thumbnail */}
        {part?.featured_photo && (
          <div className="w-8 h-8 bg-gray-800 rounded flex-shrink-0 overflow-hidden hidden sm:block">
            <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Part Info */}
        <button
          onClick={() => onPartClick?.(part, commitment)}
          className="flex-1 min-w-0 text-left hover:text-gray-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-medium truncate">{part?.part_name || 'Unknown Part'}</p>
            {/* PHASE 4: SCOPE ADD Badge for Delta Commitment Model */}
            {commitment.source_type === 'scope_addition' && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-purple-900/30 text-purple-400 border-purple-600/50 whitespace-nowrap">
                SCOPE ADD +{commitment.required_total ?? 0}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 truncate">
            {part?.vendor_part_number && <span className="font-mono">{part.vendor_part_number}</span>}
            <span>·</span>
            <span className="truncate">{resolvedCategory.name}</span>
            <span>·</span>
            <span className="truncate">{resolvedVendor.name}</span>
            {/* PHASE 4: Show parent commitment reference */}
            {commitment.parent_commitment_id && (
              <>
                <span>·</span>
                <span className="text-purple-400/70 truncate">parent: {commitment.parent_commitment_id.slice(-6)}</span>
              </>
            )}
          </div>
        </button>

        {/* Integrity violation inline badge */}
        <IntegrityViolationBadge commitment={commitment} />

        {/* PHASE 7: Inline Metrics — context-aware, effective qty display */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono flex-shrink-0">
          <EffectiveQtyBadge commitment={commitment} compact />
          {isOrderingContext ? (
            /* ORDERING: Show TO ORDER prominently, stock demoted */
            <>
              <div className="text-center">
                <span className="text-gray-500 block">TO ORDER</span>
                <span className={toOrder > 0 ? "text-red-400 font-semibold" : "text-gray-500"}>{toOrder}</span>
              </div>
              {(commitment.covered_from_po ?? 0) > 0 && (
                <div className="text-center">
                  <span className="text-gray-500 block">ORD</span>
                  <span className="text-purple-400">{commitment.covered_from_po}</span>
                </div>
              )}
              {(reservedProject + available) > 0 && (
                <div className="text-center">
                  <span className="text-gray-500 block">STOCK</span>
                  <span className="text-gray-500">{reservedProject + available}</span>
                </div>
              )}
            </>
          ) : (
            /* NON-ORDERING: Show full inventory metrics */
            <>
              {(commitment.covered_from_po ?? 0) > 0 && (
                <div className="text-center">
                  <span className="text-gray-500 block">ORD</span>
                  <span className="text-purple-400">{commitment.covered_from_po}</span>
                </div>
              )}
              <div className="text-center">
                <span className="text-gray-500 block">INST</span>
                <span className="text-emerald-400">{commitment.qty_installed ?? 0}</span>
              </div>
              <div className="text-center">
                <span className="text-gray-500 block">STOCK</span>
                <span className="text-cyan-400">{reservedProject + available}</span>
              </div>
            </>
          )}
        </div>

        {/* Inline Financial — COST | RETAIL | MARGIN | DELTA */}
        <div className="hidden xl:flex items-center gap-3 text-[10px] font-mono flex-shrink-0 border-l border-gray-700 pl-3">
          <div className="text-center">
            <span className="text-gray-500 block">{commitment.cost_source === 'po' ? 'COST (ACTUAL)' : 'PLANNED COST'}</span>
            <span className={commitment.invalid_cost ? "text-red-500" : commitment.cost_source === 'po' ? "text-emerald-400" : "text-red-400"}>
              {commitment.invalid_cost ? '$0 ⚠' : formatCurrencyUSD(commitment.actual_cost_total ?? commitment.resolved_cost_total ?? 0)}
            </span>
            {commitment.cost_source === 'po' && (commitment.planned_unit_cost ?? 0) > 0 && Math.abs((commitment.actual_unit_cost ?? 0) - (commitment.planned_unit_cost ?? 0)) > 0.01 && (
              <span className="text-gray-600 block text-[8px]">
                Plan: {formatCurrencyUSD((commitment.planned_unit_cost ?? 0) * (commitment.effective_required ?? 0))}
              </span>
            )}
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">RETAIL</span>
            <span className="text-white">{formatCurrencyUSD(commitment.planned_retail_total ?? 0)}</span>
          </div>
          <div className="text-center" title="Actual margin = quoted retail − actual purchase cost">
            <span className="text-gray-500 block">ACTUAL MARGIN</span>
            <span className={actualMargin >= 0 ? "text-emerald-400" : "text-red-400"}>
              {formatCurrencyUSD(actualMargin)}
            </span>
            {Math.abs(marginDelta) > 0.01 && plannedMargin !== 0 && (
              <span className={cn("block text-[8px]", marginDelta < 0 ? "text-red-500" : "text-emerald-500")}>
                {marginDelta < 0 ? '↓' : '↑'} {formatCurrencyUSD(Math.abs(marginDelta))} from plan
              </span>
            )}
          </div>
          {costExposure > 0 && !commitment.invalid_cost && (
            <div className="text-center">
              <span className="text-gray-500 block">EXPOSURE</span>
              <span className="text-amber-400">{formatCurrencyUSD(costExposure)}</span>
            </div>
          )}
          {commitment.invalid_cost && toOrder > 0 && (
            <div className="text-center">
              <span className="text-gray-500 block">EXPOSURE</span>
              <span className="text-red-500 text-[9px]">NO COST</span>
            </div>
          )}
          <CostSourceBadge commitment={commitment} />
        </div>

        {/* PHASE 1: Inventory State Badge — context-aware */}
        {/* PHASE 5: Hide Needs Order badge when item doesn't actually need order */}
        {!(isOrderingContext && !commitment.needs_order) && (
          <div className="flex-shrink-0 hidden md:block">
            <InventoryStateBadgeSimple commitment={commitment} tab={tab} />
          </div>
        )}

        {/* PHASE 4: Next Action Badge — HIDDEN in ordering context (prevents install badge leaking) */}
        {!isOrderingContext && (
          <div className="flex-shrink-0 hidden lg:block">
            <NextActionBadgeInline commitment={commitment} />
          </div>
        )}

        {/* Lifecycle Status - HIDDEN in ordering context (prevents stock-derived status labels) */}
        {!isOrderingContext && displayStatus !== 'Planned' && (
          <div className="hidden lg:block flex-shrink-0">
            <span className={cn(
              "text-[10px] font-mono uppercase px-1.5 py-0.5 border-l-2 bg-gray-900/50 whitespace-nowrap",
              statusColor
            )}>
              {displayStatus}
            </span>
          </div>
        )}
        
        {/* CANONICAL: Billing State Badge - Uses derived_balance_due logic for PAID display
            Paid badge shows when: derived_balance_due === 0 AND invoiced_amount > 0
            This prevents relying on potentially drifted billing_status */}
        {billingState !== 'NOT_INVOICED' && (
          <div className="hidden md:block flex-shrink-0">
            <span className={cn(
              "text-[9px] font-mono uppercase px-1.5 py-0.5 rounded whitespace-nowrap",
              billingState === 'PAID' && "bg-emerald-900/50 text-emerald-400 border border-emerald-700/50",
              billingState === 'INVOICED' && "bg-amber-900/50 text-amber-400 border border-amber-700/50"
            )}>
              {billingState}
            </span>
          </div>
        )}

        {/* PHASE 4: Details Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          className="h-7 px-2 text-[10px] text-gray-400 hover:text-white flex-shrink-0"
        >
          {showDetails ? 'Hide' : 'Details'}
          <ChevronDown className={cn("w-3 h-3 ml-1 transition-transform", showDetails && "rotate-180")} />
        </Button>

        {/* Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" disabled={!actionsEnabled}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
            {canOrder && (
              <DropdownMenuItem onClick={() => onCreatePO?.(commitment)} className="text-green-400">
                <ShoppingCart className="w-4 h-4 mr-2" />
                Create PO
              </DropdownMenuItem>
            )}
            {allowed?.canCreateDeltaOrder && (
              <DropdownMenuItem onClick={() => onDeltaOrder?.(commitment)} className="text-purple-400">
                <Plus className="w-4 h-4 mr-2" />
                Additional Order
              </DropdownMenuItem>
            )}
            {allowed?.canReceive && (
              <DropdownMenuItem onClick={() => onReceive?.(commitment)} className="text-blue-400">
                <Package className="w-4 h-4 mr-2" />
                Receive
              </DropdownMenuItem>
            )}
            {commitment.order_id && (
              <DropdownMenuItem 
                onClick={() => navigate(createPageUrl('POReceiving') + `?order_id=${commitment.order_id}`)}
                className="text-purple-400"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View PO{commitment.order_number ? ` #${commitment.order_number}` : ''}
              </DropdownMenuItem>
            )}
            {/* CANONICAL: Install/Reverse Install — BLOCKED in ordering context when to_order > 0 */}
            {!hideInstallActions && allowed?.canInstall && (
              <DropdownMenuItem onClick={() => onInstall?.(commitment)} className="text-emerald-400">
                <Wrench className="w-4 h-4 mr-2" />
                Install ({Math.max(0, reservedProject - (commitment.qty_installed ?? 0))} available)
              </DropdownMenuItem>
            )}
            {!hideInstallActions && allowed?.canReverseInstall && (
              <DropdownMenuItem onClick={() => onReverseInstall?.(commitment)} className="text-orange-400">
                <X className="w-4 h-4 mr-2" />
                Reverse Install
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onManageQty?.(commitment)} className="text-cyan-400">
              <Edit className="w-4 h-4 mr-2" />
              Manage Qty / Move
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700" />
            {onEditPricing && (
              <DropdownMenuItem onClick={() => onEditPricing?.(commitment)} className="text-emerald-400">
                <DollarSign className="w-4 h-4 mr-2" />
                Edit Pricing
              </DropdownMenuItem>
            )}
            {onSyncCost && ((commitment.order_line_item_ids || []).length > 0 || (commitment.qty_ordered ?? 0) > 0) && (
              <DropdownMenuItem onClick={() => onSyncCost?.(commitment)} className="text-blue-400">
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Cost from PO
              </DropdownMenuItem>
            )}
            {allowed?.canCancel && (
              <>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem onClick={() => onRemoveCredit?.(commitment)} className="text-red-400">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove / Credit Part
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Debug supply truth strip — always visible */}
      <div className="px-3 py-0.5 ml-6 flex items-center gap-3 text-[9px] font-mono text-gray-600 flex-wrap">
        <span>needs_order: <span className={commitment.needs_order ? "text-red-400" : "text-emerald-400"}>{String(!!commitment.needs_order)}</span></span>
        <span>to_order: <span className={((commitment.to_order_qty ?? commitment.to_order ?? 0) > 0) ? "text-red-400" : "text-gray-500"}>{commitment.to_order_qty ?? commitment.to_order ?? 0}</span></span>
        <span>plan_cost: <span className="text-gray-400">${(commitment.planned_unit_cost ?? 0).toFixed(2)}</span></span>
        <span>actual_cost: <span className={commitment.cost_source === 'po' ? "text-emerald-400" : "text-gray-400"}>${(commitment.actual_unit_cost ?? commitment.unit_cost ?? 0).toFixed(2)} ({commitment.cost_source || '?'})</span></span>
        <span>Δmargin: <span className={(commitment.margin_delta ?? 0) < -0.01 ? "text-red-400" : (commitment.margin_delta ?? 0) > 0.01 ? "text-emerald-400" : "text-gray-500"}>${(commitment.margin_delta ?? 0).toFixed(2)}</span></span>
        <span>locked: <span className={commitment.cost_locked ? "text-blue-400" : "text-gray-500"}>{String(!!commitment.cost_locked)}</span></span>
      </div>

      {/* PHASE 4: Collapsible Execution Detail */}
      {showDetails && (
        <div className="px-3 pb-3 ml-6">
          <div className="max-w-sm">
            <ExecutionDataBlock item={commitment} />
          </div>
          {/* Coverage Debug Panel — dev mode or localStorage toggle */}
          {(import.meta.env.DEV || localStorage.getItem('ak_debug_coverage') === 'true') && (
            <div className="max-w-sm mt-2">
              <CoverageDebugPanel item={commitment} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * PSMGroupCard - Expandable group card with header + items
 */
export function PSMGroupCard({
  group,
  groupMode,
  sortMode,
  isExpanded,
  onToggle,
  selectedItems,
  onSelectAll,
  onItemSelect,
  onPartClick,
  onCreatePO,
  onReceive,
  onInstall,
  onReverseInstall,
  onDeltaOrder,
  onManageQty,
  onCancel,
  onGroupOrder,
  actionsEnabled,
  categoriesMap,
  vendorsMap,
  tab,
}) {
  // Apply sorting to group items
  const sortedItems = useMemo(() => {
    return applySorting(group.items || [], sortMode);
  }, [group.items, sortMode]);

  // Calculate group stats — PLANNED vs ACTUAL margin
  const groupStats = useMemo(() => {
    const items = sortedItems;
    const totalQty = items.reduce((sum, i) => sum + (i.to_order ?? 0), 0);
    const totalActualCost = items.reduce((sum, i) => sum + (i.actual_cost_total ?? i.resolved_cost_total ?? i.planned_cost_total ?? 0), 0);
    const totalPlannedCost = items.reduce((sum, i) => sum + (i.planned_cost_total ?? 0), 0);
    const totalRetail = items.reduce((sum, i) => sum + (i.planned_retail_total ?? 0), 0);
    const totalExposure = items.reduce((sum, i) => sum + (i.cost_at_risk ?? i.resolved_exposure ?? 0), 0);
    const totalActualMargin = items.reduce((sum, i) => sum + (i.actual_margin ?? i.resolved_margin ?? 0), 0);
    const totalPlannedMargin = items.reduce((sum, i) => sum + (i.planned_margin ?? 0), 0);
    const totalMarginDelta = totalActualMargin - totalPlannedMargin;
    const readyCount = items.filter(i => {
      if (tab === 'buy') return i.to_order > 0 && i.allowed?.canCreatePO;
      if (tab === 'receive') {
        const effReq = i.effective_required ?? (i.required_total ?? 0) - (i.qty_removed ?? 0);
        const totalCov = (i.reserved_from_stock ?? 0) + (i.covered_from_po ?? 0) + (i.qty_installed ?? 0);
        return totalCov < effReq && (i.covered_from_po ?? 0) > 0;
      }
      if (tab === 'install') return i.available_to_install > 0 && i.allowed?.canInstall;
      return true;
    }).length;
    const isOrderingContext = tab === 'buy';
    const inventoryCounts = getInventoryStateCounts(items, isOrderingContext);
    return { totalQty, totalExposure, totalActualCost, totalPlannedCost, totalRetail, totalActualMargin, totalPlannedMargin, totalMarginDelta, readyCount, ...inventoryCounts };
  }, [sortedItems, tab]);

  // Get group color
  const groupColor = groupMode === 'vendor' 
    ? GROUP_COLORS.vendor 
    : groupMode === 'inventory' 
      ? GROUP_COLORS.inventory[group.inventoryState] || GROUP_COLORS.category
      : GROUP_COLORS.category;

  // Check if all orderable items are selected
  const orderableIds = sortedItems.filter(i => i.allowed?.canCreatePO && i.to_order > 0).map(i => i.id);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));

  return (
    <Card className="bg-black/40 border-gray-800 overflow-hidden">
      {/* Group Header */}
      <div 
        className="flex items-center gap-2 p-2 md:p-3 cursor-pointer hover:bg-gray-800/30 transition-colors border-l-4"
        style={{ borderLeftColor: groupColor }}
        onClick={onToggle}
      >
        {/* Select All Checkbox */}
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAll?.(sortedItems)}
          onClick={(e) => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />

        {/* Expand/Collapse */}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}

        {/* Color Dot */}
        <div 
          className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
          style={{ backgroundColor: groupColor }}
        />

        {/* Group Name */}
        <span className="text-sm font-semibold text-white flex-1 truncate">
          {group.name}
        </span>

        {/* Item Count */}
        <Badge variant="secondary" className="bg-gray-800 text-gray-300 text-[10px]">
          {sortedItems.length}
        </Badge>

        {/* Inventory State Mini Counts */}
        <div className="hidden md:flex items-center gap-1">
          {groupStats.inStock > 0 && (
            <span className="text-[10px] text-emerald-400 font-mono">{groupStats.inStock}✓</span>
          )}
          {groupStats.ordered > 0 && (
            <span className="text-[10px] text-purple-400 font-mono">{groupStats.ordered}📦</span>
          )}
          {groupStats.needsOrder > 0 && (
            <span className="text-[10px] text-red-400 font-mono">{groupStats.needsOrder}!</span>
          )}
        </div>

        {/* Group Financial Labels — Actual Margin with delta from plan */}
        <div className="hidden md:flex items-center gap-2 text-[10px] font-mono">
          <span className="text-gray-400">Cost <span className="text-red-400">{formatCurrencyUSD(groupStats.totalActualCost)}</span></span>
          <span className="text-gray-400">Rev <span className="text-white">{formatCurrencyUSD(groupStats.totalRetail)}</span></span>
          <span className="text-gray-400">Margin <span className={groupStats.totalActualMargin >= 0 ? "text-emerald-400" : "text-red-400"}>{formatCurrencyUSD(groupStats.totalActualMargin)}</span></span>
          {Math.abs(groupStats.totalMarginDelta) > 0.01 && (
            <span className={groupStats.totalMarginDelta < 0 ? "text-red-500" : "text-emerald-500"}>
              Δ {groupStats.totalMarginDelta < 0 ? '' : '+'}{formatCurrencyUSD(groupStats.totalMarginDelta)}
            </span>
          )}
        </div>

        {/* Cost at Risk Badge */}
        {groupStats.totalExposure > 0 && (
          <Badge className="bg-amber-900/50 text-amber-400 border-amber-700 text-[10px]">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {formatCurrencyUSD(groupStats.totalExposure)}
          </Badge>
        )}

        {/* Order All Button */}
        {tab === 'buy' && groupStats.readyCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onGroupOrder?.(sortedItems);
            }}
            className="border-purple-700 text-purple-400 hover:bg-purple-900/30 h-6 text-[10px]"
          >
            <ShoppingCart className="w-3 h-3 mr-1" />
            Order {groupStats.readyCount}
          </Button>
        )}
      </div>

      {/* Group Items (expanded) */}
      {isExpanded && (
        <div className="border-t border-gray-800">
          {sortedItems.length === 0 ? (
            <p className="text-center py-6 text-gray-500">No items in this group</p>
          ) : (
            sortedItems.map(commitment => (
              <PSMItemRow
                key={commitment.id}
                commitment={commitment}
                isSelected={selectedItems.has(commitment.id)}
                onSelect={() => onItemSelect?.(commitment.id)}
                onPartClick={onPartClick}
                onCreatePO={onCreatePO}
                onReceive={onReceive}
                onInstall={onInstall}
                onReverseInstall={onReverseInstall}
                onDeltaOrder={onDeltaOrder}
                onManageQty={onManageQty}
                onCancel={onCancel}
                actionsEnabled={actionsEnabled}
                categoriesMap={categoriesMap}
                vendorsMap={vendorsMap}
                tab={tab}
              />
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// LEGACY PSMGroupCard no longer used - replaced by PSMGroupCardWithSubgroups

// Subgroup options (same list but for secondary grouping)
const SUBGROUP_OPTIONS = [
  { value: 'none', label: 'No Sub-group' },
  { value: 'category', label: 'Category' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'inventory', label: 'Inventory State' },
];

// Helper to get grouping info for an item — HARDENED against missing fields
// CANONICAL: In inventory mode, uses coverage-based grouping (to_order/coverage_status)
// to prevent "In Stock" + "Needs Order" conflicts
function getGroupInfo(item, mode, categoriesMap, vendorsMap) {
  if (!item) return { key: '_unknown', name: 'Unknown', inventoryState: null };

  try {
    if (mode === 'vendor') {
      // CANONICAL: Use resolver to determine vendor from sources, not stale item.vendor_id
      const resolved = resolveDefaultVendor(item, null, {});
      const vendorId = resolved?.vendor_id || item.vendor?.id || item.vendor_id || null;
      const vendorNameRaw = resolved?.vendor_name || item.vendor?.vendor_name || item.vendor_name || null;
      const vendorDisplay = resolveVendorDisplay(vendorId, vendorNameRaw, vendorsMap);
      return {
        key: vendorId || 'unassigned',
        name: vendorDisplay?.name || 'No Vendor',
        inventoryState: null,
      };
    } else if (mode === 'inventory') {
      // CANONICAL: Use backend needs_order / commitment_fulfilled as sole grouping signal
      if (item.needs_order === true) {
        return { key: 'NEEDS_ORDER', name: '! Needs Order', inventoryState: 'NEEDS_ORDER' };
      }
      if (item.commitment_fulfilled === true) {
        return { key: 'IN_STOCK', name: '✓ Fulfilled', inventoryState: 'IN_STOCK' };
      }
      // Not fulfilled but doesn't need order — PO coverage pending receive
      const ordered = item.covered_from_po ?? 0;
      if (ordered > 0) {
        return { key: 'ORDERED', name: '📦 Ordered', inventoryState: 'ORDERED' };
      }
      const reserved = item.reserved_from_stock ?? 0;
      if (reserved > 0) {
        return { key: 'IN_STOCK', name: '✓ In Stock', inventoryState: 'IN_STOCK' };
      }
      return { key: 'NEEDS_ORDER', name: '! Needs Order', inventoryState: 'NEEDS_ORDER' };
    } else {
      // category (default)
      const catId = item.categoryId || null;
      const catObj = item.categoryObj || item.categoryName || null;
      const catDisplay = resolveCategoryDisplay(catId, catObj, categoriesMap);
      return {
        key: catId || 'uncategorized',
        name: catDisplay?.name || 'Uncategorized',
        inventoryState: null,
      };
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[getGroupInfo] Error resolving group for item', item.id || item.commitment_id, mode, err);
    }
    return { key: '_error', name: 'Unknown', inventoryState: null };
  }
}

/**
 * PSMSubGroupCard - Nested subgroup within a primary group
 */
function PSMSubGroupCard({
  subgroup,
  subgroupMode,
  sortMode,
  isExpanded,
  onToggle,
  selectedItems,
  onSelectAll,
  onItemSelect,
  onPartClick,
  onCreatePO,
  onReceive,
  onInstall,
  onReverseInstall,
  onDeltaOrder,
  onManageQty,
  onCancel,
  onRemoveCredit,
  onEditPricing,
  onSyncCost,
  actionsEnabled,
  categoriesMap,
  vendorsMap,
  tab,
}) {
  const sortedItems = useMemo(() => applySorting(subgroup.items || [], sortMode), [subgroup.items, sortMode]);
  
  // Get subgroup color
  const subgroupColor = subgroupMode === 'vendor' 
    ? GROUP_COLORS.vendor 
    : subgroupMode === 'inventory' 
      ? GROUP_COLORS.inventory[subgroup.inventoryState] || GROUP_COLORS.category
      : GROUP_COLORS.category;

  const orderableIds = sortedItems.filter(i => i.allowed?.canCreatePO && i.to_order > 0).map(i => i.id);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));

  return (
    <div className="ml-4 border-l-2 border-gray-700/50">
      {/* Subgroup Header */}
      <div 
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-800/20 transition-colors"
        onClick={onToggle}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAll?.(sortedItems)}
          onClick={(e) => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 text-gray-500" />
        ) : (
          <ChevronDown className="w-3 h-3 text-gray-500" />
        )}
        <div 
          className="w-2 h-2 rounded-full flex-shrink-0" 
          style={{ backgroundColor: subgroupColor }}
        />
        <span className="text-xs font-medium text-gray-300 flex-1 truncate">
          {subgroup.name}
        </span>
        <Badge variant="secondary" className="bg-gray-800/50 text-gray-400 text-[9px]">
          {sortedItems.length}
        </Badge>
      </div>

      {/* Subgroup Items */}
      {isExpanded && (
        <div className="ml-2">
          {sortedItems.map(commitment => (
            <PSMItemRow
              key={commitment.id}
              commitment={commitment}
              isSelected={selectedItems.has(commitment.id)}
              onSelect={() => onItemSelect?.(commitment.id)}
              onPartClick={onPartClick}
              onCreatePO={onCreatePO}
              onReceive={onReceive}
              onInstall={onInstall}
              onReverseInstall={onReverseInstall}
              onDeltaOrder={onDeltaOrder}
              onManageQty={onManageQty}
              onCancel={onCancel}
              onRemoveCredit={onRemoveCredit}
              onEditPricing={onEditPricing}
              onSyncCost={onSyncCost}
              actionsEnabled={actionsEnabled}
              categoriesMap={categoriesMap}
              vendorsMap={vendorsMap}
              tab={tab}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// CANONICAL: Billing status filter options using 3-state model
const BILLING_STATUS_OPTIONS = [
  { value: 'NOT_INVOICED', label: 'Not Invoiced' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'PAID', label: 'Paid' },
];

/**
 * PSMGroupedView - Main grouped card view container
 * PHASE 5: Grouping + Sorting Enhancement
 * PHASE 6: Sub-grouping support
 * PHASE 7: Billing status filters
 */
export default function PSMGroupedView({
  items,
  groupMode = 'category',
  onGroupModeChange,
  selectedItems,
  setSelectedItems,
  onPartClick,
  onCreatePO,
  onReceive,
  onInstall,
  onReverseInstall,
  onDeltaOrder,
  onManageQty,
  onCancel,
  onRemoveCredit,
  onEditPricing,
  onSyncCost,
  onBatchPO,
  actionsEnabled = true,
  categoriesMap,
  vendorsMap,
  tab,
}) {
  // PART 2: Default ALL groups expanded - use 'all' as marker for "expand everything"
  const [expandedGroups, setExpandedGroups] = useState(new Set(['__ALL_EXPANDED__']));
  const [expandedSubgroups, setExpandedSubgroups] = useState(new Set(['__ALL_EXPANDED__']));
  const [subgroupMode, setSubgroupMode] = useState('none');
  const [sortMode, setSortMode] = useState('cost_at_risk_desc');
  // CANONICAL: Billing status filter using 3-state model - default all selected
  const [billingFilters, setBillingFilters] = useState(new Set(['NOT_INVOICED', 'INVOICED', 'PAID']));

  // Toggle a billing status filter
  const toggleBillingFilter = (status) => {
    setBillingFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        // Don't allow deselecting all
        if (next.size > 1) next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: HARD FILTER — Buy tab renders ONLY needs_order === true
  // This is the FINAL render-layer gate. Upstream filters may have
  // already done this, but this guarantees 100% compliance.
  // ═══════════════════════════════════════════════════════════════════
  const visibleItems = useMemo(() => {
    if (tab === 'buy') {
      const filtered = items.filter(i => i.needs_order === true);
      // PHASE 3: ASSERTION — log any items that were stripped
      if (import.meta.env.DEV || localStorage.getItem('ak_debug_coverage') === 'true') {
        const stripped = items.length - filtered.length;
        if (stripped > 0) {
          console.error(`[NEEDS_ORDER RENDER GATE] Stripped ${stripped} items from Buy tab that had needs_order !== true`);
          items.filter(i => i.needs_order !== true).forEach(i => {
            console.error('[NEEDS_ORDER RENDER GATE] Rejected item:', {
              id: i.id || i.commitment_id,
              part: i.part?.part_name,
              needs_order: i.needs_order,
              commitment_fulfilled: i.commitment_fulfilled,
              to_order: i.to_order_qty ?? i.to_order,
              coverage_qty: i.coverage_qty,
              effective_required: i.effective_required,
            });
          });
        }
      }
      return filtered;
    }
    return items;
  }, [items, tab]);

  // CANONICAL: Filter items by billing_state (3-state model from backend)
  const filteredItems = useMemo(() => {
    if (billingFilters.size === 3) return visibleItems; // All selected, no filter
    
    return visibleItems.filter(item => {
      // Use canonical billing_state from backend, fallback to NOT_INVOICED
      const billingState = item.billing_state || 'NOT_INVOICED';
      return billingFilters.has(billingState);
    });
  }, [visibleItems, billingFilters]);

  // Get available subgroup options (exclude current primary group)
  const availableSubgroupOptions = useMemo(() => {
    return SUBGROUP_OPTIONS.filter(opt => opt.value === 'none' || opt.value !== groupMode);
  }, [groupMode]);

  // Reset subgroup when primary group changes if they match
  React.useEffect(() => {
    if (subgroupMode === groupMode) {
      setSubgroupMode('none');
    }
  }, [groupMode, subgroupMode]);

  // Group items by mode, with optional subgrouping
  const groups = useMemo(() => {
    const result = {};

    filteredItems.forEach(item => {
      const groupInfo = getGroupInfo(item, groupMode, categoriesMap, vendorsMap);
      const { key: groupKey, name: groupName, inventoryState } = groupInfo;

      if (!result[groupKey]) {
        result[groupKey] = {
          key: groupKey,
          name: groupName,
          inventoryState,
          items: [],
          subgroups: {},
        };
      }
      result[groupKey].items.push(item);

      // Handle subgrouping if enabled
      if (subgroupMode !== 'none') {
        const subInfo = getGroupInfo(item, subgroupMode, categoriesMap, vendorsMap);
        const subKey = subInfo.key;
        
        if (!result[groupKey].subgroups[subKey]) {
          result[groupKey].subgroups[subKey] = {
            key: subKey,
            name: subInfo.name,
            inventoryState: subInfo.inventoryState,
            items: [],
          };
        }
        result[groupKey].subgroups[subKey].items.push(item);
      }
    });

    // Sort groups — guard against undefined names
    const sorted = Object.values(result);
    if (groupMode === 'inventory') {
      const order = { NEEDS_ORDER: 0, ORDERED: 1, IN_STOCK: 2, OUT_OF_STOCK: 0, PARTIAL_STOCK: 1 };
      sorted.sort((a, b) => (order[a.inventoryState] ?? 3) - (order[b.inventoryState] ?? 3));
    } else {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    // Sort subgroups within each group — guard against undefined names
    sorted.forEach(group => {
      const subArr = Object.values(group.subgroups || {});
      if (subgroupMode === 'inventory') {
        const order = { NEEDS_ORDER: 0, ORDERED: 1, IN_STOCK: 2, OUT_OF_STOCK: 0, PARTIAL_STOCK: 1 };
        subArr.sort((a, b) => (order[a.inventoryState] ?? 3) - (order[b.inventoryState] ?? 3));
      } else {
        subArr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }
      group.sortedSubgroups = subArr;
    });

    return sorted;
  }, [filteredItems, groupMode, subgroupMode, categoriesMap, vendorsMap]);

  // PART 2: Check if group is expanded (respects __ALL_EXPANDED__ marker)
  const isGroupExpanded = (groupKey) => {
    return expandedGroups.has('__ALL_EXPANDED__') || expandedGroups.has(groupKey);
  };

  // PART 2: Check if subgroup is expanded (respects __ALL_EXPANDED__ marker)
  const isSubgroupExpanded = (subgroupKey) => {
    return expandedSubgroups.has('__ALL_EXPANDED__') || expandedSubgroups.has(subgroupKey);
  };

  // Toggle group expansion - clears __ALL_EXPANDED__ on first manual toggle
  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => {
      // If __ALL_EXPANDED__ is set, switch to explicit mode with all groups expanded except clicked one
      if (prev.has('__ALL_EXPANDED__')) {
        const next = new Set(groups.map(g => g.key));
        next.delete(groupKey); // Collapse the clicked group
        return next;
      }
      // Normal toggle
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  // Toggle subgroup expansion - clears __ALL_EXPANDED__ on first manual toggle
  const toggleSubgroup = (subgroupKey) => {
    setExpandedSubgroups(prev => {
      // If __ALL_EXPANDED__ is set, switch to explicit mode
      if (prev.has('__ALL_EXPANDED__')) {
        const allSubKeys = new Set();
        groups.forEach(g => {
          g.sortedSubgroups?.forEach(sg => allSubKeys.add(`${g.key}:${sg.key}`));
        });
        allSubKeys.delete(subgroupKey); // Collapse the clicked subgroup
        return allSubKeys;
      }
      // Normal toggle
      const next = new Set(prev);
      if (next.has(subgroupKey)) next.delete(subgroupKey);
      else next.add(subgroupKey);
      return next;
    });
  };

  // Select all in group
  const selectAllInGroup = (groupItems) => {
    const orderableIds = groupItems.filter(i => i.allowed?.canCreatePO && i.to_order > 0).map(i => i.id);
    const allSelected = orderableIds.every(id => selectedItems.has(id));
    
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) {
        orderableIds.forEach(id => next.delete(id));
      } else {
        orderableIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // Select single item
  const selectItem = (commitmentId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(commitmentId)) next.delete(commitmentId);
      else next.add(commitmentId);
      return next;
    });
  };

  // Order all in group
  const handleGroupOrder = (groupItems) => {
    const orderableIds = groupItems.filter(i => i.allowed?.canCreatePO && i.to_order > 0).map(i => i.id);
    orderableIds.forEach(id => {
      setSelectedItems(prev => new Set(prev).add(id));
    });
    // Trigger batch PO creation
    setTimeout(() => onBatchPO?.(), 100);
  };

  // PART 2: No auto-expand logic needed - groups default to expanded via __ALL_EXPANDED__

  if (filteredItems.length === 0) {
    return (
      <div className="space-y-3">
        {/* Billing Status Filters - show even when empty */}
        <div className="flex items-center gap-4 px-1">
          <span className="text-[10px] text-gray-500 uppercase">Billing</span>
          {BILLING_STATUS_OPTIONS.map(opt => (
            <label 
              key={opt.value} 
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Checkbox
                checked={billingFilters.has(opt.value)}
                onCheckedChange={() => toggleBillingFilter(opt.value)}
                className="h-3.5 w-3.5"
              />
              <span className={cn(
                "text-xs",
                billingFilters.has(opt.value) ? "text-gray-200" : "text-gray-500"
              )}>
                {opt.label}
              </span>
            </label>
          ))}
        </div>
        <div className="text-center py-12 text-gray-500">
          {visibleItems.length === 0 
            ? (tab === 'buy' ? 'No items need ordering' : 'No items in this tab')
            : 'No items match billing filters'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Grouping + Sub-grouping + Sorting Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Primary Group */}
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-gray-500" />
          <span className="text-[10px] text-gray-500 uppercase">Group</span>
          <Select value={groupMode} onValueChange={onGroupModeChange}>
            <SelectTrigger className="w-32 h-8 text-xs bg-gray-900 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="inventory">Inventory State</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sub-group */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600">→</span>
          <span className="text-[10px] text-gray-500 uppercase">Then</span>
          <Select value={subgroupMode} onValueChange={setSubgroupMode}>
            <SelectTrigger className="w-32 h-8 text-xs bg-gray-900 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableSubgroupOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto">
          <ArrowUpDown className="w-4 h-4 text-gray-500" />
          <span className="text-[10px] text-gray-500 uppercase">Sort</span>
          <Select value={sortMode} onValueChange={setSortMode}>
            <SelectTrigger className="w-44 h-8 text-xs bg-gray-900 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Billing Status Filters */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-[10px] text-gray-500 uppercase">Billing</span>
        {BILLING_STATUS_OPTIONS.map(opt => (
          <label 
            key={opt.value} 
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <Checkbox
              checked={billingFilters.has(opt.value)}
              onCheckedChange={() => toggleBillingFilter(opt.value)}
              className="h-3.5 w-3.5"
            />
            <span className={cn(
              "text-xs",
              billingFilters.has(opt.value) ? "text-gray-200" : "text-gray-500"
            )}>
              {opt.label}
            </span>
          </label>
        ))}
        {filteredItems.length !== items.length && (
          <span className="text-[10px] text-gray-500 ml-2">
            ({filteredItems.length} of {items.length})
          </span>
        )}
      </div>

      {/* Groups */}
      {groups.map(group => (
        <PSMGroupCardWithSubgroups
        key={group.key}
        group={group}
        groupMode={groupMode}
        subgroupMode={subgroupMode}
        sortMode={sortMode}
        isExpanded={isGroupExpanded(group.key)}
        expandedSubgroups={expandedSubgroups}
        onToggle={() => toggleGroup(group.key)}
        onToggleSubgroup={(subKey) => toggleSubgroup(`${group.key}:${subKey}`)}
        selectedItems={selectedItems}
        onSelectAll={selectAllInGroup}
        onItemSelect={selectItem}
        onPartClick={onPartClick}
        onCreatePO={onCreatePO}
        onReceive={onReceive}
        onInstall={onInstall}
        onReverseInstall={onReverseInstall}
        onDeltaOrder={onDeltaOrder}
        onManageQty={onManageQty}
        onCancel={onCancel}
        onRemoveCredit={onRemoveCredit}
        onEditPricing={onEditPricing}
        onSyncCost={onSyncCost}
        onGroupOrder={handleGroupOrder}
        actionsEnabled={actionsEnabled}
        categoriesMap={categoriesMap}
        vendorsMap={vendorsMap}
        tab={tab}
        />
      ))}
    </div>
  );
}

/**
 * PSMGroupCardWithSubgroups - Enhanced group card with subgroup support
 */
function PSMGroupCardWithSubgroups({
  group,
  groupMode,
  subgroupMode,
  sortMode,
  isExpanded,
  expandedSubgroups,
  onToggle,
  onToggleSubgroup,
  selectedItems,
  onSelectAll,
  onItemSelect,
  onPartClick,
  onCreatePO,
  onReceive,
  onInstall,
  onReverseInstall,
  onDeltaOrder,
  onManageQty,
  onCancel,
  onRemoveCredit,
  onEditPricing,
  onSyncCost,
  onGroupOrder,
  actionsEnabled,
  categoriesMap,
  vendorsMap,
  tab,
}) {
  const items = group.items;
  const hasSubgroups = subgroupMode !== 'none' && group.sortedSubgroups?.length > 0;

  // Local helper — mirrors logic from parent PSMGroupedView
  const isSubgroupExpanded = (subKey) => {
    return expandedSubgroups.has('__ALL_EXPANDED__') || expandedSubgroups.has(subKey);
  };
  
  // Sort items for flat view (when no subgrouping)
  const sortedItems = useMemo(() => applySorting(items, sortMode), [items, sortMode]);

  // Calculate group stats — PLANNED vs ACTUAL margin
  const groupStats = useMemo(() => {
    const totalQty = items.reduce((sum, i) => sum + (i.required_total ?? 0), 0);
    const totalActualCost = items.reduce((sum, i) => sum + (i.actual_cost_total ?? i.resolved_cost_total ?? i.planned_cost_total ?? 0), 0);
    const totalPlannedCost = items.reduce((sum, i) => sum + (i.planned_cost_total ?? 0), 0);
    const totalRetail = items.reduce((sum, i) => sum + (i.planned_retail_total ?? 0), 0);
    const totalExposure = items.reduce((sum, i) => sum + (i.cost_at_risk ?? i.resolved_exposure ?? 0), 0);
    const totalActualMargin = items.reduce((sum, i) => sum + (i.actual_margin ?? i.resolved_margin ?? 0), 0);
    const totalPlannedMargin = items.reduce((sum, i) => sum + (i.planned_margin ?? 0), 0);
    const totalMarginDelta = totalActualMargin - totalPlannedMargin;
    const readyCount = items.filter(i => {
      if (tab === 'buy') return i.allowed?.canCreatePO && i.to_order > 0;
      if (tab === 'install') return i.available_to_install > 0 && i.allowed?.canInstall;
      return true;
    }).length;
    const isOrderingContext = tab === 'buy';
    const inventoryCounts = getInventoryStateCounts(items, isOrderingContext);
    return { totalQty, totalExposure, totalActualCost, totalPlannedCost, totalRetail, totalActualMargin, totalPlannedMargin, totalMarginDelta, readyCount, ...inventoryCounts };
  }, [items, tab]);

  // Get group color
  const groupColor = groupMode === 'vendor' 
    ? GROUP_COLORS.vendor 
    : groupMode === 'inventory' 
      ? GROUP_COLORS.inventory[group.inventoryState] || GROUP_COLORS.category
      : GROUP_COLORS.category;

  // Check if all orderable items are selected
  const orderableIds = items.filter(i => i.allowed?.canCreatePO && i.to_order > 0).map(i => i.id);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));

  return (
    <Card className="bg-black/40 border-gray-800 overflow-hidden">
      {/* Group Header */}
      <div 
        className="flex items-center gap-2 p-2 md:p-3 cursor-pointer hover:bg-gray-800/30 transition-colors border-l-4"
        style={{ borderLeftColor: groupColor }}
        onClick={onToggle}
      >
        {/* Select All Checkbox */}
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAll?.(items)}
          onClick={(e) => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />

        {/* Expand/Collapse */}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}

        {/* Color Dot */}
        <div 
          className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
          style={{ backgroundColor: groupColor }}
        />

        {/* Group Name */}
        <span className="text-sm font-semibold text-white flex-1 truncate">
          {group.name}
        </span>

        {/* Item Count */}
        <Badge variant="secondary" className="bg-gray-800 text-gray-300 text-[10px]">
          {items.length}
        </Badge>

        {/* Inventory State Mini Counts */}
        <div className="hidden md:flex items-center gap-1">
          {groupStats.inStock > 0 && (
            <span className="text-[10px] text-emerald-400 font-mono">{groupStats.inStock}✓</span>
          )}
          {groupStats.ordered > 0 && (
            <span className="text-[10px] text-purple-400 font-mono">{groupStats.ordered}📦</span>
          )}
          {groupStats.needsOrder > 0 && (
            <span className="text-[10px] text-red-400 font-mono">{groupStats.needsOrder}!</span>
          )}
        </div>

        {/* Group Financial Labels — Actual Margin with delta from plan */}
        <div className="hidden md:flex items-center gap-2 text-[10px] font-mono">
          <span className="text-gray-400">Cost <span className="text-red-400">{formatCurrencyUSD(groupStats.totalActualCost)}</span></span>
          <span className="text-gray-400">Rev <span className="text-white">{formatCurrencyUSD(groupStats.totalRetail)}</span></span>
          <span className="text-gray-400">Margin <span className={groupStats.totalActualMargin >= 0 ? "text-emerald-400" : "text-red-400"}>{formatCurrencyUSD(groupStats.totalActualMargin)}</span></span>
          {Math.abs(groupStats.totalMarginDelta) > 0.01 && (
            <span className={groupStats.totalMarginDelta < 0 ? "text-red-500" : "text-emerald-500"}>
              Δ {groupStats.totalMarginDelta < 0 ? '' : '+'}{formatCurrencyUSD(groupStats.totalMarginDelta)}
            </span>
          )}
        </div>

        {/* Cost at Risk Badge */}
        {groupStats.totalExposure > 0 && (
          <Badge className="bg-amber-900/50 text-amber-400 border-amber-700 text-[10px]">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {formatCurrencyUSD(groupStats.totalExposure)}
          </Badge>
        )}

        {/* Order All Button */}
        {tab === 'buy' && groupStats.readyCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onGroupOrder?.(items);
            }}
            className="border-purple-700 text-purple-400 hover:bg-purple-900/30 h-6 text-[10px]"
          >
            <ShoppingCart className="w-3 h-3 mr-1" />
            Order {groupStats.readyCount}
          </Button>
        )}
      </div>

      {/* Group Content (expanded) */}
      {isExpanded && (
        <div className="border-t border-gray-800">
          {items.length === 0 ? (
            <p className="text-center py-6 text-gray-500">No items in this group</p>
          ) : hasSubgroups ? (
            // Render with subgroups
            <div className="py-1">
              {group.sortedSubgroups.map(subgroup => (
                <PSMSubGroupCard
                  key={subgroup.key}
                  subgroup={subgroup}
                  subgroupMode={subgroupMode}
                  sortMode={sortMode}
                  isExpanded={isSubgroupExpanded(`${group.key}:${subgroup.key}`)}
                  onToggle={() => onToggleSubgroup(subgroup.key)}
                  selectedItems={selectedItems}
                  onSelectAll={onSelectAll}
                  onItemSelect={onItemSelect}
                  onPartClick={onPartClick}
                  onCreatePO={onCreatePO}
                  onReceive={onReceive}
                  onInstall={onInstall}
                  onReverseInstall={onReverseInstall}
                  onDeltaOrder={onDeltaOrder}
                  onManageQty={onManageQty}
                  onCancel={onCancel}
                  onRemoveCredit={onRemoveCredit}
                  onEditPricing={onEditPricing}
                  onSyncCost={onSyncCost}
                  actionsEnabled={actionsEnabled}
                  categoriesMap={categoriesMap}
                  vendorsMap={vendorsMap}
                  tab={tab}
                />
              ))}
            </div>
          ) : (
            // Render flat list (no subgrouping)
            sortedItems.map(commitment => (
              <PSMItemRow
                key={commitment.id}
                commitment={commitment}
                isSelected={selectedItems.has(commitment.id)}
                onSelect={() => onItemSelect?.(commitment.id)}
                onPartClick={onPartClick}
                onCreatePO={onCreatePO}
                onReceive={onReceive}
                onInstall={onInstall}
                onReverseInstall={onReverseInstall}
                onDeltaOrder={onDeltaOrder}
                onManageQty={onManageQty}
                onCancel={onCancel}
                onRemoveCredit={onRemoveCredit}
                onEditPricing={onEditPricing}
                onSyncCost={onSyncCost}
                actionsEnabled={actionsEnabled}
                categoriesMap={categoriesMap}
                vendorsMap={vendorsMap}
                tab={tab}
              />
            ))
          )}
        </div>
      )}
    </Card>
  );
}