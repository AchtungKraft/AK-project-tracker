import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown, ChevronUp, ShoppingCart, AlertTriangle,
  ArrowUpDown, Package, ExternalLink, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { PSMItemRow } from "@/components/supply/PSMGroupedCards";
import resolveDefaultVendor from "@/components/supply/resolveDefaultVendor";

/**
 * AggregatedProcurementView - Vendor → Part hierarchy procurement view
 *
 * HARD RULE: Never renders raw commitments at top level.
 * Structure: Vendor → Part (aggregated) → commitments[] (expanded only)
 *
 * CANONICAL: Aggregation is VISUAL ONLY — backend still receives commitment_ids.
 */

// ============================================================================
// VENDOR SOURCE RESOLVER — retained for backward compat (per-vendor URL lookup)
// For DEFAULT vendor resolution, use resolveDefaultVendor instead.
// ============================================================================
export function resolveActiveVendorSource(part_id, vendor_id, item, vendorSourcesByPart) {
  if (!vendor_id) return null;

  // 1. Override sources (from VendorQueueView selection)
  const overrideSources = vendorSourcesByPart?.[part_id] || [];
  const override = overrideSources.find(s => s.vendor_id === vendor_id);
  if (override) return override;

  // 2. Item-embedded vendor_sources (from read model)
  const sources = item?.vendor_sources || [];
  const match = sources.find(s => s.vendor_id === vendor_id);
  if (match) return match;

  // 3. Fallback to item defaults if vendor matches
  if (item?.vendor_id === vendor_id || item?.vendor?.id === vendor_id) {
    return {
      order_url: item.order_url,
      unit_cost: item.resolved_unit_cost ?? item.unit_cost,
      vendor_part_number: item.vendor_part_number ?? item.part?.vendor_part_number,
    };
  }

  return null;
}

// ============================================================================
// SORT OPTIONS
// ============================================================================
const SORT_OPTIONS = [
  { value: 'to_order_desc', label: 'Qty to Order (High → Low)' },
  { value: 'cost_desc', label: 'Total Cost (High → Low)' },
  { value: 'exposure_desc', label: 'Exposure (High → Low)' },
  { value: 'alphabetical', label: 'Alphabetical' },
];

function sortParts(parts, sortMode) {
  const sorted = [...parts];
  switch (sortMode) {
    case 'to_order_desc':
      return sorted.sort((a, b) => b.total_to_order - a.total_to_order);
    case 'cost_desc':
      return sorted.sort((a, b) => b.total_cost - a.total_cost);
    case 'exposure_desc':
      return sorted.sort((a, b) => b.total_exposure - a.total_exposure);
    case 'alphabetical':
      return sorted.sort((a, b) => (a.part_name || '').localeCompare(b.part_name || ''));
    default:
      return sorted;
  }
}

// ============================================================================
// AGGREGATED PART ROW — one row per part per vendor
// ============================================================================
function AggregatedPartRow({
  partAgg,
  isExpanded,
  onToggle,
  selectedItems,
  onSelectAll,
  onItemSelect,
  onPartClick,
  onCreatePO,
  onReceive,
  onDeltaOrder,
  actionsEnabled,
  categoriesMap,
  vendorsMap,
}) {
  const orderableIds = partAgg.commitments
    .filter(c => c.allowed?.canCreatePO && (c.to_order ?? 0) > 0)
    .map(c => c.id);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));

  const projectNames = [...new Set(partAgg.commitments.map(c => c.project_name).filter(Boolean))];
  const isMultiProject = partAgg.commitments.length > 1;

  return (
    <div className="border-b border-gray-800/50 last:border-b-0">
      {/* Part Row */}
      <div
        className="flex items-center gap-2 p-2 md:p-3 cursor-pointer hover:bg-gray-800/30 transition-colors"
        onClick={onToggle}
      >
        {/* Select All underlying commitments */}
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAll?.(partAgg.commitments)}
          onClick={(e) => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />

        {/* Expand */}
        {isExpanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        )}

        {/* Thumbnail */}
        {partAgg.featured_photo && (
          <div className="w-8 h-8 bg-gray-800 rounded flex-shrink-0 overflow-hidden hidden sm:block">
            <img src={partAgg.featured_photo} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Part Info */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPartClick?.({ id: partAgg.part_id }, partAgg.commitments[0]);
          }}
          className="flex-1 min-w-0 text-left hover:text-gray-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-medium truncate">{partAgg.part_name}</p>
            {isMultiProject && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-purple-900/30 text-purple-400 border-purple-600/50 whitespace-nowrap">
                {partAgg.commitments.length} projects
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 truncate">
            {partAgg.vendor_part_number && <span className="font-mono">{partAgg.vendor_part_number}</span>}
            {projectNames.length > 0 && (
              <>
                <span>·</span>
                <span className="truncate text-blue-400/70">
                  {projectNames.length <= 2 ? projectNames.join(', ') : `${projectNames[0]} +${projectNames.length - 1}`}
                </span>
              </>
            )}
          </div>
        </button>

        {/* Aggregated Metrics */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono flex-shrink-0">
          <div className="text-center">
            <span className="text-gray-500 block">TO ORDER</span>
            <span className={partAgg.total_to_order > 0 ? "text-red-400 font-semibold text-sm" : "text-gray-500"}>
              {partAgg.total_to_order}
            </span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">COST</span>
            <span className="text-yellow-400">{formatCurrencyUSD(partAgg.total_cost)}</span>
          </div>
          {partAgg.total_exposure > 0 && (
            <div className="text-center">
              <span className="text-gray-500 block">EXPO</span>
              <span className="text-amber-400">{formatCurrencyUSD(partAgg.total_exposure)}</span>
            </div>
          )}
        </div>

        {/* Mobile metrics */}
        <div className="flex lg:hidden items-center gap-2 flex-shrink-0">
          <Badge variant="secondary" className="bg-red-900/50 text-red-400 text-[10px]">
            {partAgg.total_to_order} qty
          </Badge>
        </div>

        {/* Order URL link */}
        {partAgg.order_url && (
          <a
            href={partAgg.order_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 flex-shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Expanded: Show underlying commitments */}
      {isExpanded && (
        <div className="ml-6 border-l-2 border-gray-700/50">
          <div className="px-3 py-1 bg-gray-900/30 text-[10px] text-gray-500 flex items-center gap-2">
            <Package className="w-3 h-3" />
            Per-project commitments:
          </div>
          {partAgg.commitments.map(commitment => (
            <PSMItemRow
              key={commitment.id}
              commitment={commitment}
              isSelected={selectedItems.has(commitment.id)}
              onSelect={() => onItemSelect?.(commitment.id)}
              onPartClick={onPartClick}
              onCreatePO={onCreatePO}
              onReceive={onReceive}
              onDeltaOrder={onDeltaOrder}
              actionsEnabled={actionsEnabled}
              categoriesMap={categoriesMap}
              vendorsMap={vendorsMap}
              tab="buy"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VENDOR GROUP CARD — contains aggregated parts for one vendor
// ============================================================================
function VendorGroupCard({
  vendorGroup,
  sortMode,
  isExpanded,
  onToggle,
  expandedParts,
  onTogglePart,
  selectedItems,
  onSelectAllVendor,
  onSelectAllPart,
  onItemSelect,
  onPartClick,
  onCreatePO,
  onReceive,
  onDeltaOrder,
  onBatchPO,
  actionsEnabled,
  categoriesMap,
  vendorsMap,
}) {
  const sortedParts = useMemo(
    () => sortParts(vendorGroup.parts, sortMode),
    [vendorGroup.parts, sortMode]
  );

  const totalQty = vendorGroup.parts.reduce((s, p) => s + p.total_to_order, 0);
  const totalCost = vendorGroup.parts.reduce((s, p) => s + p.total_cost, 0);
  const totalExposure = vendorGroup.parts.reduce((s, p) => s + p.total_exposure, 0);
  const allCommitments = vendorGroup.parts.flatMap(p => p.commitments);
  const orderableIds = allCommitments
    .filter(c => c.allowed?.canCreatePO && (c.to_order ?? 0) > 0)
    .map(c => c.id);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));

  return (
    <Card className="bg-black/40 border-gray-800 overflow-hidden">
      {/* Vendor Header */}
      <div
        className="flex items-center gap-2 p-2 md:p-3 cursor-pointer hover:bg-gray-800/30 transition-colors border-l-4 border-l-blue-500"
        onClick={onToggle}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAllVendor?.(allCommitments)}
          onClick={(e) => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />

        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}

        <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />

        <span className="text-sm font-semibold text-white flex-1 truncate">
          {vendorGroup.vendor_name || 'No Vendor'}
        </span>

        <Badge variant="secondary" className="bg-gray-800 text-gray-300 text-[10px]">
          {sortedParts.length} parts
        </Badge>

        <div className="hidden md:flex items-center gap-3 text-[10px] font-mono">
          <span className="text-gray-400">Qty <span className="text-red-400">{totalQty}</span></span>
          <span className="text-gray-400">Cost <span className="text-yellow-400">{formatCurrencyUSD(totalCost)}</span></span>
          {totalExposure > 0 && (
            <span className="text-amber-400">
              <AlertTriangle className="w-3 h-3 inline mr-0.5" />
              {formatCurrencyUSD(totalExposure)}
            </span>
          )}
        </div>

        {orderableIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              // Select all orderable, then trigger batch
              onSelectAllVendor?.(allCommitments);
              setTimeout(() => onBatchPO?.(), 100);
            }}
            className="border-purple-700 text-purple-400 hover:bg-purple-900/30 h-6 text-[10px]"
          >
            <ShoppingCart className="w-3 h-3 mr-1" />
            Order All
          </Button>
        )}
      </div>

      {/* Vendor Parts */}
      {isExpanded && (
        <div className="border-t border-gray-800">
          {sortedParts.length === 0 ? (
            <p className="text-center py-6 text-gray-500">No parts</p>
          ) : (
            sortedParts.map(partAgg => (
              <AggregatedPartRow
                key={partAgg.part_id}
                partAgg={partAgg}
                isExpanded={expandedParts.has(`${vendorGroup.vendor_id}::${partAgg.part_id}`)}
                onToggle={() => onTogglePart(`${vendorGroup.vendor_id}::${partAgg.part_id}`)}
                selectedItems={selectedItems}
                onSelectAll={onSelectAllPart}
                onItemSelect={onItemSelect}
                onPartClick={onPartClick}
                onCreatePO={onCreatePO}
                onReceive={onReceive}
                onDeltaOrder={onDeltaOrder}
                actionsEnabled={actionsEnabled}
                categoriesMap={categoriesMap}
                vendorsMap={vendorsMap}
              />
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AggregatedProcurementView({
  items,
  selectedItems,
  setSelectedItems,
  onPartClick,
  onCreatePO,
  onReceive,
  onDeltaOrder,
  onBatchPO,
  actionsEnabled = true,
  categoriesMap,
  vendorsMap,
  vendorSourcesByPart = {},
}) {
  const [expandedVendors, setExpandedVendors] = useState(new Set(['__ALL__']));
  const [expandedParts, setExpandedParts] = useState(new Set());
  const [sortMode, setSortMode] = useState('to_order_desc');

  // ============================================================================
  // AGGREGATION: Vendor → Part → Commitments[]
  // HARD RULE: One row per part per vendor. Never raw commitments at top level.
  // ============================================================================
  const vendorGroups = useMemo(() => {
    const vMap = new Map();

    for (const item of items) {
      // Canonical resolution: source-defined vendor takes precedence over stale commitment vendor
      const resolved = resolveDefaultVendor(item, null, vendorSourcesByPart);
      const vKey = resolved?.vendor_id || item.vendor_id || item.vendor?.id || 'unassigned';
      const vName = resolved?.vendor_name || item.vendor_name || item.vendor?.vendor_name || 'No Vendor';

      if (!vMap.has(vKey)) {
        vMap.set(vKey, {
          vendor_id: vKey === 'unassigned' ? null : vKey,
          vendor_name: vName,
          partsMap: new Map(),
        });
      }

      const vendor = vMap.get(vKey);
      const pKey = item.part_id;

      if (!vendor.partsMap.has(pKey)) {
        vendor.partsMap.set(pKey, {
          part_id: pKey,
          part_name: item.part_name || item.part?.part_name || 'Unknown',
          vendor_part_number: resolved?.vendor_part_number || item.vendor_part_number || item.part?.vendor_part_number || null,
          featured_photo: item.featured_photo || item.part?.featured_photo || null,
          order_url: resolved?.order_url || item.order_url || null,
          resolved_unit_cost: resolved?.unit_cost ?? item.resolved_unit_cost ?? item.unit_cost ?? 0,
          total_to_order: 0,
          total_cost: 0,
          total_exposure: 0,
          commitments: [],
        });
      }

      const part = vendor.partsMap.get(pKey);
      const toOrder = item.to_order ?? 0;
      part.total_to_order += toOrder;
      part.total_cost += (item.resolved_cost_total ?? item.estimated_cost ?? item.planned_cost_total ?? 0);
      part.total_exposure += (item.resolved_exposure ?? item.exposure_gap ?? 0);
      part.commitments.push(item);
    }

    // Convert maps to arrays and sort vendors alphabetically
    const result = Array.from(vMap.values()).map(v => ({
      ...v,
      parts: Array.from(v.partsMap.values()),
    }));
    result.sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));

    return result;
  }, [items, vendorSourcesByPart]);

  // DEV GUARD: Detect duplicate part rows within a vendor
  if (import.meta.env.DEV) {
    for (const vg of vendorGroups) {
      const seen = new Set();
      for (const p of vg.parts) {
        const key = `${p.part_id}-${vg.vendor_id}`;
        if (seen.has(key)) {
          console.warn('[DUPLICATE PART ROW IN ORDER VIEW]', key, vg.vendor_name, p.part_name);
        }
        seen.add(key);
      }
    }
  }

  // Stats
  const stats = useMemo(() => {
    const allParts = vendorGroups.flatMap(v => v.parts);
    return {
      vendorCount: vendorGroups.length,
      uniqueParts: allParts.length,
      totalCommitments: items.length,
      totalQty: allParts.reduce((s, p) => s + p.total_to_order, 0),
      totalCost: allParts.reduce((s, p) => s + p.total_cost, 0),
      totalExposure: allParts.reduce((s, p) => s + p.total_exposure, 0),
      multiProjectParts: allParts.filter(p => p.commitments.length > 1).length,
    };
  }, [vendorGroups, items.length]);

  // Expand/collapse helpers
  const isVendorExpanded = (vKey) => expandedVendors.has('__ALL__') || expandedVendors.has(vKey);

  const toggleVendor = (vKey) => {
    setExpandedVendors(prev => {
      if (prev.has('__ALL__')) {
        // Switch from all-expanded to explicit — expand all except clicked
        const next = new Set(vendorGroups.map(v => v.vendor_id || 'unassigned'));
        next.delete(vKey);
        return next;
      }
      const next = new Set(prev);
      if (next.has(vKey)) next.delete(vKey);
      else next.add(vKey);
      return next;
    });
  };

  const togglePart = (partKey) => {
    setExpandedParts(prev => {
      const next = new Set(prev);
      if (next.has(partKey)) next.delete(partKey);
      else next.add(partKey);
      return next;
    });
  };

  // Selection helpers — always operate on commitment_ids
  const selectAllForGroup = (commitments) => {
    const orderableIds = commitments
      .filter(c => c.allowed?.canCreatePO && (c.to_order ?? 0) > 0)
      .map(c => c.id);
    const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));

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

  const selectItem = (commitmentId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(commitmentId)) next.delete(commitmentId);
      else next.add(commitmentId);
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Aggregation Summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <Card className="bg-black/40 border-blue-900/50">
          <CardContent className="p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase">Vendors</p>
            <p className="text-lg font-bold text-blue-400">{stats.vendorCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-purple-900/50">
          <CardContent className="p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase">Unique Parts</p>
            <p className="text-lg font-bold text-purple-400">{stats.uniqueParts}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-gray-800">
          <CardContent className="p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase">Commitments</p>
            <p className="text-lg font-bold text-gray-300">{stats.totalCommitments}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-red-900/50">
          <CardContent className="p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase">Total Qty</p>
            <p className="text-lg font-bold text-red-400">{stats.totalQty}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-yellow-900/50">
          <CardContent className="p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase">Total Cost</p>
            <p className="text-lg font-bold text-yellow-400 font-mono">{formatCurrencyUSD(stats.totalCost)}</p>
          </CardContent>
        </Card>
        <Card className="bg-black/40 border-amber-900/50">
          <CardContent className="p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase">Exposure</p>
            <p className={cn("text-lg font-bold font-mono", stats.totalExposure > 0 ? "text-amber-400" : "text-gray-500")}>
              {formatCurrencyUSD(stats.totalExposure)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sort Control */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4 text-gray-500" />
        <span className="text-[10px] text-gray-500 uppercase">Sort Parts</span>
        <Select value={sortMode} onValueChange={setSortMode}>
          <SelectTrigger className="w-52 h-8 text-xs bg-gray-900 border-gray-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-gray-500 ml-2">
          {stats.vendorCount} vendors · {stats.uniqueParts} parts · {stats.totalCommitments} commitments
          {stats.multiProjectParts > 0 && (
            <span className="text-purple-400 ml-1">({stats.multiProjectParts} multi-project)</span>
          )}
        </span>
      </div>

      {/* Vendor Groups */}
      {vendorGroups.map(vg => (
        <VendorGroupCard
          key={vg.vendor_id || 'unassigned'}
          vendorGroup={vg}
          sortMode={sortMode}
          isExpanded={isVendorExpanded(vg.vendor_id || 'unassigned')}
          onToggle={() => toggleVendor(vg.vendor_id || 'unassigned')}
          expandedParts={expandedParts}
          onTogglePart={togglePart}
          selectedItems={selectedItems}
          onSelectAllVendor={selectAllForGroup}
          onSelectAllPart={selectAllForGroup}
          onItemSelect={selectItem}
          onPartClick={onPartClick}
          onCreatePO={onCreatePO}
          onReceive={onReceive}
          onDeltaOrder={onDeltaOrder}
          onBatchPO={onBatchPO}
          actionsEnabled={actionsEnabled}
          categoriesMap={categoriesMap}
          vendorsMap={vendorsMap}
        />
      ))}
    </div>
  );
}