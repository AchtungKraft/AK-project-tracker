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
  ChevronDown, ChevronUp, MoreVertical, ShoppingCart, Package,
  Wrench, Plus, Edit, Trash2, X, DollarSign, AlertTriangle, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverageBadgeInline } from "@/components/parts/CoverageBadge";
import { PrepayStatusBadge } from "@/components/supply/InventoryStateBadge";
import PricingIntegrityBadge from "@/components/supply/PricingIntegrityBadge";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { resolveVendorDisplay, resolveCategoryDisplay } from "@/components/supply/supplyResolvers";
import { getDisplayStatus, getDisplayStatusColor } from "@/components/supply/lifecycleDisplay";

/**
 * PSMGroupedCards - GNO-style card-based grouped UI for ProjectSupplyManager
 * 
 * Replaces dense table layout with:
 * - Expandable group cards
 * - Color-coded group headers
 * - Batch selection at group level
 * - Summary metrics per group
 * - Compact item rows within groups
 */

// Group color mapping
const GROUP_COLORS = {
  vendor: '#3B82F6',      // Blue
  category: '#6B7280',    // Gray
  coverage: {
    FULL: '#10B981',      // Green
    PARTIAL: '#F59E0B',   // Amber
    NONE: '#EF4444',      // Red
  }
};

// Get color for coverage status
const getCoverageColor = (status) => {
  return GROUP_COLORS.coverage[status] || GROUP_COLORS.coverage.NONE;
};

// Get coverage label
const getCoverageLabel = (status) => {
  switch (status) {
    case 'FULL': return '✓ Fully Covered';
    case 'PARTIAL': return '◐ Partially Covered';
    case 'NONE': return '○ Uncovered';
    default: return status || 'Unknown';
  }
};

/**
 * PSMSummaryStrip - Top summary cards (GNO-style)
 */
export function PSMSummaryStrip({ items, tab }) {
  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalRetail = items.reduce((sum, i) => sum + (i.planned_retail_total ?? 0), 0);
    const totalExposure = items.reduce((sum, i) => sum + (i.exposure_gap ?? 0), 0);
    const readyCount = items.filter(i => {
      if (tab === 'buy') return i.to_order > 0 && i.allowed?.canCreatePO;
      if (tab === 'receive') return i.on_order_qty > 0 && i.allowed?.canReceive;
      if (tab === 'install') return i.available_to_install > 0 && i.allowed?.canInstall;
      return true;
    }).length;
    const blockedCount = items.filter(i => i.block_reason_code).length;

    return { totalItems, totalRetail, totalExposure, readyCount, blockedCount };
  }, [items, tab]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500">Items</p>
          <p className="text-lg font-bold text-white">{stats.totalItems}</p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500">Planned Retail</p>
          <p className="text-lg font-bold text-white font-mono">{formatCurrencyUSD(stats.totalRetail)}</p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-gray-800">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500">Exposure</p>
          <p className={cn(
            "text-lg font-bold font-mono",
            stats.totalExposure > 0 ? "text-amber-500" : "text-gray-400"
          )}>
            {formatCurrencyUSD(stats.totalExposure)}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-emerald-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500">Ready</p>
          <p className="text-lg font-bold text-emerald-400">{stats.readyCount}</p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-red-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-gray-500">Blocked</p>
          <p className={cn(
            "text-lg font-bold",
            stats.blockedCount > 0 ? "text-red-400" : "text-gray-500"
          )}>
            {stats.blockedCount}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// PHASE 4: Import shared ExecutionDataBlock component
import ExecutionDataBlock from "./ExecutionDataBlock";

/**
 * PSMItemRow - Compact horizontal item row within a group
 * PHASE 4: Now includes ExecutionDataBlock for full inventory transparency
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
  actionsEnabled = true,
  categoriesMap,
  vendorsMap,
  tab = 'plan',
}) {
  const { part, vendor, allowed, categoryObj } = commitment;
  const displayStatus = getDisplayStatus(commitment.commitment_status);
  const statusColor = getDisplayStatusColor(displayStatus);

  // CANONICAL inventory values
  const inv = commitment.inventory_snapshot || {};
  const inStock = inv.physical_stock_global ?? inv.physical ?? 0;
  const reservedGlobal = inv.reserved_global_active ?? inv.reserved ?? 0;
  const reservedProject = inv.reserved_this_project ?? commitment.reserved_from_stock ?? 0;
  const needed = inv.needed ?? Math.max(0, commitment.required_total - (commitment.qty_installed ?? 0));
  const toOrder = commitment.to_order ?? 0;
  const available = inv.available_global_active ?? inv.available ?? 0;

  // Resolve names
  const resolvedVendor = resolveVendorDisplay(
    commitment.vendor?.id || vendor?.id,
    vendor || commitment.vendor_name,
    vendorsMap
  );
  const resolvedCategory = resolveCategoryDisplay(
    commitment.categoryId,
    categoryObj || commitment.categoryName,
    categoriesMap
  );

  const canOrder = allowed?.canCreatePO && toOrder > 0;

  return (
    <div className={cn(
      "p-3 hover:bg-gray-800/30 transition-colors border-b border-gray-800/50 last:border-b-0",
      commitment.block_reason_code && "opacity-60"
    )}>
      {/* Main Row */}
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          disabled={!allowed?.canCreatePO}
        />

        {/* Thumbnail */}
        {part?.featured_photo && (
          <div className="w-10 h-10 bg-gray-800 rounded flex-shrink-0 overflow-hidden">
            <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Part Info */}
        <button
          onClick={() => onPartClick?.(part, commitment)}
          className="flex-1 min-w-0 text-left hover:text-gray-300 transition-colors"
        >
          <p className="text-white text-sm font-medium truncate">{part?.part_name || 'Unknown Part'}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {part?.vendor_part_number && <span className="font-mono">{part.vendor_part_number}</span>}
            <span>· {resolvedCategory.name}</span>
            <span>· {resolvedVendor.name}</span>
          </div>
        </button>

        {/* Coverage Badge */}
        <div className="w-24 hidden md:block">
          <CoverageBadgeInline coverage={{
            coverage_status: commitment.coverage_status,
            gap_qty: toOrder,
            qty_needed: needed,
            qty_reserved: reservedProject,
            qty_ordered: commitment.covered_from_po ?? 0,
            qty_installed: commitment.qty_installed ?? 0,
          }} />
        </div>

        {/* Lifecycle Status */}
        <div className="hidden lg:block">
          <span className={cn(
            "text-[10px] font-mono uppercase px-1.5 py-0.5 border-l-2 bg-gray-900/50 whitespace-nowrap",
            statusColor
          )}>
            {displayStatus}
          </span>
        </div>

        {/* Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!actionsEnabled}>
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
            {allowed?.canInstall && (
              <DropdownMenuItem onClick={() => onInstall?.(commitment)} className="text-emerald-400">
                <Wrench className="w-4 h-4 mr-2" />
                Install
              </DropdownMenuItem>
            )}
            {allowed?.canReverseInstall && (
              <DropdownMenuItem onClick={() => onReverseInstall?.(commitment)} className="text-orange-400">
                <X className="w-4 h-4 mr-2" />
                Reverse Install
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onManageQty?.(commitment)} className="text-cyan-400">
              <Edit className="w-4 h-4 mr-2" />
              Manage Qty / Move
            </DropdownMenuItem>
            {allowed?.canCancel && (
              <>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem onClick={() => onCancel?.(commitment)} className="text-red-400">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* PHASE 4: Execution Data Block - Always visible on Plan + Buy tabs */}
      {(tab === 'plan' || tab === 'buy') && (
        <div className="mt-2 ml-6 max-w-xs">
          <ExecutionDataBlock commitment={commitment} tab={tab} />
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
  const items = group.items || [];
  
  // Calculate group stats from canonical fields
  const groupStats = useMemo(() => {
    const totalQty = items.reduce((sum, i) => sum + (i.to_order ?? 0), 0);
    const totalExposure = items.reduce((sum, i) => sum + (i.exposure_gap ?? 0), 0);
    const totalCost = items.reduce((sum, i) => sum + (i.planned_cost_total ?? 0), 0);
    const readyCount = items.filter(i => {
      if (tab === 'buy') return i.to_order > 0 && i.allowed?.canCreatePO;
      if (tab === 'receive') return i.on_order_qty > 0 && i.allowed?.canReceive;
      if (tab === 'install') return i.available_to_install > 0 && i.allowed?.canInstall;
      return true;
    }).length;
    return { totalQty, totalExposure, totalCost, readyCount };
  }, [items, tab]);

  // Get group color
  const groupColor = groupMode === 'vendor' 
    ? GROUP_COLORS.vendor 
    : groupMode === 'coverage' 
      ? getCoverageColor(group.coverageStatus)
      : GROUP_COLORS.category;

  // Check if all orderable items are selected
  const orderableIds = items.filter(i => i.allowed?.canCreatePO && i.to_order > 0).map(i => i.id);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));

  return (
    <Card className="bg-black/40 border-gray-800 overflow-hidden">
      {/* Group Header */}
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-800/30 transition-colors border-l-4"
        style={{ borderLeftColor: groupColor }}
        onClick={onToggle}
      >
        {/* Select All Checkbox */}
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={(e) => {
            e.stopPropagation();
            onSelectAll?.(items);
          }}
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
          className="w-3 h-3 rounded-full flex-shrink-0" 
          style={{ backgroundColor: groupColor }}
        />

        {/* Group Name */}
        <span className="text-sm font-semibold text-white flex-1 truncate">
          {groupMode === 'coverage' ? getCoverageLabel(group.coverageStatus) : group.name}
        </span>

        {/* Item Count */}
        <Badge variant="secondary" className="bg-gray-800 text-gray-300">
          {items.length}
        </Badge>

        {/* Ready Count */}
        {groupStats.readyCount > 0 && (
          <Badge className="bg-emerald-900/50 text-emerald-400 border-emerald-700">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {groupStats.readyCount} ready
          </Badge>
        )}

        {/* Exposure Total */}
        {groupStats.totalExposure > 0 && (
          <Badge className="bg-amber-900/50 text-amber-400 border-amber-700">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {formatCurrencyUSD(groupStats.totalExposure)}
          </Badge>
        )}

        {/* Est Cost */}
        <span className="text-xs text-gray-500 font-mono hidden md:block">
          {formatCurrencyUSD(groupStats.totalCost)}
        </span>

        {/* Order All Button */}
        {tab === 'buy' && groupStats.readyCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onGroupOrder?.(items);
            }}
            className="border-purple-700 text-purple-400 hover:bg-purple-900/30 h-7"
          >
            <ShoppingCart className="w-3 h-3 mr-1" />
            Order All
          </Button>
        )}
      </div>

      {/* Group Items (expanded) */}
      {isExpanded && (
        <div className="border-t border-gray-800">
          {items.length === 0 ? (
            <p className="text-center py-6 text-gray-500">No items in this group</p>
          ) : (
            items.map(commitment => (
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

/**
 * PSMGroupedView - Main grouped card view container
 */
export default function PSMGroupedView({
  items,
  groupMode = 'category',
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
  onBatchPO,
  actionsEnabled = true,
  categoriesMap,
  vendorsMap,
  tab,
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set(['all']));

  // Group items by mode
  const groups = useMemo(() => {
    const result = {};

    items.forEach(item => {
      let groupKey, groupName, coverageStatus;

      if (groupMode === 'vendor') {
        groupKey = item.vendor?.id || 'unassigned';
        const vendorDisplay = resolveVendorDisplay(item.vendor?.id, item.vendor?.vendor_name || item.vendor_name, vendorsMap);
        groupName = vendorDisplay.name;
      } else if (groupMode === 'coverage') {
        coverageStatus = item.coverage_status === 'FULL' ? 'FULL' :
                         item.coverage_status === 'PARTIAL' ? 'PARTIAL' : 'NONE';
        groupKey = coverageStatus;
        groupName = getCoverageLabel(coverageStatus);
      } else {
        // category (default)
        groupKey = item.categoryId || 'uncategorized';
        const catDisplay = resolveCategoryDisplay(item.categoryId, item.categoryObj || item.categoryName, categoriesMap);
        groupName = catDisplay.name;
      }

      if (!result[groupKey]) {
        result[groupKey] = {
          key: groupKey,
          name: groupName,
          coverageStatus,
          items: [],
        };
      }
      result[groupKey].items.push(item);
    });

    // Sort groups
    const sorted = Object.values(result);
    if (groupMode === 'coverage') {
      const order = { FULL: 0, PARTIAL: 1, NONE: 2 };
      sorted.sort((a, b) => (order[a.coverageStatus] ?? 3) - (order[b.coverageStatus] ?? 3));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    return sorted;
  }, [items, groupMode, categoriesMap, vendorsMap]);

  // Toggle group expansion
  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
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

  // Auto-expand first group
  React.useEffect(() => {
    if (groups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set([groups[0].key]));
    }
  }, [groups]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No items in this tab
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(group => (
        <PSMGroupCard
          key={group.key}
          group={group}
          groupMode={groupMode}
          isExpanded={expandedGroups.has(group.key)}
          onToggle={() => toggleGroup(group.key)}
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