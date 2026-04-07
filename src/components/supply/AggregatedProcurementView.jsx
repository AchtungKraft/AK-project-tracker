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
  ArrowUpDown, Layers, Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { PSMItemRow } from "@/components/supply/PSMGroupedCards";

/**
 * AggregatedProcurementView - Part-level grouped procurement view
 * 
 * Groups commitment-level items by part_id + vendor_id to show
 * "what do we actually order?" instead of "what does each project need?"
 * 
 * CANONICAL: Aggregation is VISUAL ONLY - backend still receives commitment_ids.
 */

const SORT_OPTIONS = [
  { value: 'to_order_desc', label: 'Qty to Order (High → Low)' },
  { value: 'cost_desc', label: 'Total Cost (High → Low)' },
  { value: 'exposure_desc', label: 'Exposure (High → Low)' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'commitments_desc', label: 'Commitments (High → Low)' },
];

function applySorting(items, sortMode) {
  const sorted = [...items];
  switch (sortMode) {
    case 'to_order_desc':
      return sorted.sort((a, b) => b.total_to_order - a.total_to_order);
    case 'cost_desc':
      return sorted.sort((a, b) => b.total_cost - a.total_cost);
    case 'exposure_desc':
      return sorted.sort((a, b) => b.total_exposure - a.total_exposure);
    case 'commitments_desc':
      return sorted.sort((a, b) => b.commitments.length - a.commitments.length);
    case 'alphabetical':
      return sorted.sort((a, b) => (a.part_name || '').localeCompare(b.part_name || ''));
    default:
      return sorted;
  }
}

/**
 * AggregatedRow - Single part-level aggregated row with expandable commitments
 */
function AggregatedRow({
  agg,
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
  const allIds = agg.commitments.map(c => c.id);
  const orderableIds = agg.commitments
    .filter(c => c.allowed?.canCreatePO && (c.to_order ?? 0) > 0)
    .map(c => c.id);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));

  const projectNames = [...new Set(agg.commitments.map(c => c.project_name).filter(Boolean))];

  return (
    <Card className="bg-black/40 border-gray-800 overflow-hidden">
      {/* Aggregated Header */}
      <div
        className="flex items-center gap-2 p-2 md:p-3 cursor-pointer hover:bg-gray-800/30 transition-colors border-l-4 border-l-purple-600"
        onClick={onToggle}
      >
        {/* Select All */}
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAll?.(agg.commitments)}
          onClick={(e) => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />

        {/* Expand */}
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}

        {/* Thumbnail */}
        {agg.featured_photo && (
          <div className="w-8 h-8 bg-gray-800 rounded flex-shrink-0 overflow-hidden hidden sm:block">
            <img src={agg.featured_photo} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Part Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white text-sm font-medium truncate">{agg.part_name || 'Unknown Part'}</p>
            {agg.commitments.length > 1 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-purple-900/30 text-purple-400 border-purple-600/50 whitespace-nowrap">
                {agg.commitments.length} projects
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 truncate">
            {agg.vendor_part_number && <span className="font-mono">{agg.vendor_part_number}</span>}
            {agg.vendor_name && (
              <>
                <span>·</span>
                <span className="truncate">{agg.vendor_name}</span>
              </>
            )}
            {projectNames.length > 0 && (
              <>
                <span>·</span>
                <span className="truncate text-blue-400/70">
                  {projectNames.length <= 2 ? projectNames.join(', ') : `${projectNames[0]} +${projectNames.length - 1}`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Aggregated Metrics */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono flex-shrink-0">
          <div className="text-center">
            <span className="text-gray-500 block">TO ORDER</span>
            <span className={agg.total_to_order > 0 ? "text-red-400 font-semibold text-sm" : "text-gray-500"}>
              {agg.total_to_order}
            </span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">COST</span>
            <span className="text-yellow-400">{formatCurrencyUSD(agg.total_cost)}</span>
          </div>
          {agg.total_exposure > 0 && (
            <div className="text-center">
              <span className="text-gray-500 block">EXPO</span>
              <span className="text-amber-400">{formatCurrencyUSD(agg.total_exposure)}</span>
            </div>
          )}
        </div>

        {/* Mobile metrics */}
        <div className="flex lg:hidden items-center gap-2 flex-shrink-0">
          <Badge variant="secondary" className="bg-red-900/50 text-red-400 text-[10px]">
            {agg.total_to_order} qty
          </Badge>
        </div>

        {/* Commitment count */}
        <Badge variant="secondary" className="bg-gray-800 text-gray-300 text-[10px]">
          {agg.commitments.length}
        </Badge>
      </div>

      {/* Expanded: Show underlying commitments */}
      {isExpanded && (
        <div className="border-t border-gray-800">
          <div className="px-3 py-1 bg-gray-900/30 text-[10px] text-gray-500 flex items-center gap-2">
            <Package className="w-3 h-3" />
            Individual project commitments for this part:
          </div>
          {agg.commitments.map(commitment => (
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
    </Card>
  );
}

/**
 * AggregatedProcurementView - Main container
 */
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
}) {
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortMode, setSortMode] = useState('to_order_desc');

  // AGGREGATION LAYER: Group by part_id + vendor_id
  const aggregatedItems = useMemo(() => {
    const map = new Map();

    for (const item of items) {
      const key = `${item.part_id}::${item.vendor_id || item.vendor?.id || 'none'}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          part_id: item.part_id,
          part_name: item.part_name || item.part?.part_name || 'Unknown',
          vendor_part_number: item.vendor_part_number || item.part?.vendor_part_number || null,
          featured_photo: item.featured_photo || item.part?.featured_photo || null,
          vendor_id: item.vendor_id || item.vendor?.id || null,
          vendor_name: item.vendor_name || item.vendor?.vendor_name || null,
          total_to_order: 0,
          total_cost: 0,
          total_exposure: 0,
          commitments: [],
        });
      }

      const agg = map.get(key);
      agg.total_to_order += (item.to_order ?? 0);
      agg.total_cost += (item.resolved_cost_total ?? item.estimated_cost ?? item.planned_cost_total ?? 0);
      agg.total_exposure += (item.resolved_exposure ?? item.exposure_gap ?? 0);
      agg.commitments.push(item);
    }

    return Array.from(map.values());
  }, [items]);

  // Apply sorting
  const sortedAggregated = useMemo(() => {
    return applySorting(aggregatedItems, sortMode);
  }, [aggregatedItems, sortMode]);

  // Aggregate stats
  const stats = useMemo(() => ({
    uniqueParts: aggregatedItems.length,
    totalCommitments: items.length,
    totalQty: aggregatedItems.reduce((s, a) => s + a.total_to_order, 0),
    totalCost: aggregatedItems.reduce((s, a) => s + a.total_cost, 0),
    totalExposure: aggregatedItems.reduce((s, a) => s + a.total_exposure, 0),
    multiProjectParts: aggregatedItems.filter(a => a.commitments.length > 1).length,
  }), [aggregatedItems, items.length]);

  // Toggle row expansion
  const toggleRow = (key) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Select all in aggregated row
  const selectAllInRow = (commitments) => {
    const orderableIds = commitments
      .filter(c => c.allowed?.canCreatePO && (c.to_order ?? 0) > 0)
      .map(c => c.id);
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

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Aggregation Summary Bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
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
        <Card className="bg-black/40 border-blue-900/50">
          <CardContent className="p-2 text-center">
            <p className="text-[9px] text-gray-500 uppercase">Multi-Project</p>
            <p className={cn("text-lg font-bold", stats.multiProjectParts > 0 ? "text-blue-400" : "text-gray-500")}>
              {stats.multiProjectParts}
            </p>
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
        <span className="text-[10px] text-gray-500 uppercase">Sort</span>
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
          {stats.uniqueParts} parts from {stats.totalCommitments} commitments
        </span>
      </div>

      {/* Aggregated Rows */}
      {sortedAggregated.map(agg => (
        <AggregatedRow
          key={agg.key}
          agg={agg}
          isExpanded={expandedRows.has(agg.key)}
          onToggle={() => toggleRow(agg.key)}
          selectedItems={selectedItems}
          onSelectAll={selectAllInRow}
          onItemSelect={selectItem}
          onPartClick={onPartClick}
          onCreatePO={onCreatePO}
          onReceive={onReceive}
          onDeltaOrder={onDeltaOrder}
          actionsEnabled={actionsEnabled}
          categoriesMap={categoriesMap}
          vendorsMap={vendorsMap}
        />
      ))}
    </div>
  );
}