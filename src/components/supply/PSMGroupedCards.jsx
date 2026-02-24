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
  ArrowUpDown, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InventoryStateBadgeSimple, getInventoryStateCounts } from "./InventoryStateBadgeSimple";
import PricingIntegrityBadge from "@/components/supply/PricingIntegrityBadge";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { resolveVendorDisplay, resolveCategoryDisplay } from "@/components/supply/supplyResolvers";
import { getDisplayStatus, getDisplayStatusColor } from "@/components/supply/lifecycleDisplay";
import ExecutionDataBlock from "./ExecutionDataBlock";

/**
 * PSMGroupedCards - Build Management Optimized UI
 * 
 * REFACTORED FOR:
 * - Removed "Covered" semantics
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
    PARTIAL_STOCK: '#F59E0B', // Amber
    OUT_OF_STOCK: '#EF4444',  // Red
  }
};

// Sort options
const SORT_OPTIONS = [
  { value: 'exposure_desc', label: 'Exposure (High → Low)' },
  { value: 'retail_desc', label: 'Retail (High → Low)' },
  { value: 'required_desc', label: 'Qty Required (High → Low)' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'to_order_desc', label: 'To Order (High → Low)' },
];

// Apply sorting to items
function applySorting(items, sortMode) {
  const sorted = [...items];
  switch (sortMode) {
    case 'exposure_desc':
      return sorted.sort((a, b) => (b.exposure_gap ?? 0) - (a.exposure_gap ?? 0));
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
  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalExposure = items.reduce((sum, i) => sum + (i.exposure_gap ?? 0), 0);
    const inventoryCounts = getInventoryStateCounts(items);
    
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
      <Card className="bg-black/40 border-amber-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Partial</p>
          <p className={cn(
            "text-lg font-bold",
            stats.partialStock > 0 ? "text-amber-400" : "text-gray-500"
          )}>
            {stats.partialStock}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-black/40 border-red-900/50">
        <CardContent className="p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Out of Stock</p>
          <p className={cn(
            "text-lg font-bold",
            stats.outOfStock > 0 ? "text-red-400" : "text-gray-500"
          )}>
            {stats.outOfStock}
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
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Exposure</p>
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
  actionsEnabled = true,
  categoriesMap,
  vendorsMap,
  tab = 'plan',
}) {
  // PHASE 4: Collapsible execution detail
  const [showDetails, setShowDetails] = useState(false);
  
  const { part, vendor, allowed, categoryObj } = commitment;
  const displayStatus = getDisplayStatus(commitment.commitment_status);
  const statusColor = getDisplayStatusColor(displayStatus);

  // CANONICAL inventory values
  const inv = commitment.inventory_snapshot || {};
  const reservedProject = inv.reserved_this_project ?? commitment.reserved_from_stock ?? 0;
  const toOrder = commitment.to_order ?? 0;
  const exposureGap = commitment.exposure_gap ?? 0;
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

  // PHASE 6: Disable ordering when gap_qty === 0
  const canOrder = allowed?.canCreatePO && toOrder > 0;

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
          <p className="text-white text-sm font-medium truncate">{part?.part_name || 'Unknown Part'}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 truncate">
            {part?.vendor_part_number && <span className="font-mono">{part.vendor_part_number}</span>}
            <span>·</span>
            <span className="truncate">{resolvedCategory.name}</span>
            <span>·</span>
            <span className="truncate">{resolvedVendor.name}</span>
          </div>
        </button>

        {/* PHASE 3: Inline Inventory Metrics */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono flex-shrink-0">
          <div className="text-center">
            <span className="text-gray-500 block">REQ</span>
            <span className="text-white">{commitment.required_total ?? 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">INST</span>
            <span className="text-emerald-400">{commitment.qty_installed ?? 0}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">STOCK</span>
            <span className="text-cyan-400">{reservedProject + available}</span>
          </div>
          {/* PHASE 2: Only show ORDER if > 0 */}
          {toOrder > 0 && (
            <div className="text-center">
              <span className="text-gray-500 block">ORDER</span>
              <span className="text-red-400 font-semibold">{toOrder}</span>
            </div>
          )}
        </div>

        {/* PHASE 3: Inline Financial */}
        <div className="hidden xl:flex items-center gap-3 text-[10px] font-mono flex-shrink-0 border-l border-gray-700 pl-3">
          <div className="text-center">
            <span className="text-gray-500 block">COST</span>
            <span className="text-gray-300">{formatCurrencyUSD(commitment.planned_cost_total ?? 0)}</span>
          </div>
          <div className="text-center">
            <span className="text-gray-500 block">RETAIL</span>
            <span className="text-white">{formatCurrencyUSD(commitment.planned_retail_total ?? 0)}</span>
          </div>
          {/* PHASE 2: Only show EXPOSURE if > 0 */}
          {exposureGap > 0 && (
            <div className="text-center">
              <span className="text-gray-500 block">EXPO</span>
              <span className="text-amber-400">{formatCurrencyUSD(exposureGap)}</span>
            </div>
          )}
        </div>

        {/* PHASE 1: Inventory State Badge */}
        <div className="flex-shrink-0 hidden md:block">
          <InventoryStateBadgeSimple commitment={commitment} />
        </div>

        {/* Lifecycle Status */}
        <div className="hidden lg:block flex-shrink-0">
          <span className={cn(
            "text-[10px] font-mono uppercase px-1.5 py-0.5 border-l-2 bg-gray-900/50 whitespace-nowrap",
            statusColor
          )}>
            {displayStatus}
          </span>
        </div>

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

      {/* PHASE 4: Collapsible Execution Detail */}
      {showDetails && (
        <div className="px-3 pb-3 ml-6">
          <div className="max-w-sm">
            <ExecutionDataBlock item={commitment} />
          </div>
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

  // Calculate group stats from canonical fields
  const groupStats = useMemo(() => {
    const items = sortedItems;
    const totalQty = items.reduce((sum, i) => sum + (i.to_order ?? 0), 0);
    const totalExposure = items.reduce((sum, i) => sum + (i.exposure_gap ?? 0), 0);
    const totalCost = items.reduce((sum, i) => sum + (i.planned_cost_total ?? 0), 0);
    const readyCount = items.filter(i => {
      if (tab === 'buy') return i.to_order > 0 && i.allowed?.canCreatePO;
      if (tab === 'receive') return i.on_order_qty > 0 && i.allowed?.canReceive;
      if (tab === 'install') return i.available_to_install > 0 && i.allowed?.canInstall;
      return true;
    }).length;
    const inventoryCounts = getInventoryStateCounts(items);
    return { totalQty, totalExposure, totalCost, readyCount, ...inventoryCounts };
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
          {groupStats.partialStock > 0 && (
            <span className="text-[10px] text-amber-400 font-mono">{groupStats.partialStock}~</span>
          )}
          {groupStats.outOfStock > 0 && (
            <span className="text-[10px] text-red-400 font-mono">{groupStats.outOfStock}!</span>
          )}
        </div>

        {/* Exposure Total - PHASE 2: Only show if > 0 */}
        {groupStats.totalExposure > 0 && (
          <Badge className="bg-amber-900/50 text-amber-400 border-amber-700 text-[10px]">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {formatCurrencyUSD(groupStats.totalExposure)}
          </Badge>
        )}

        {/* Est Cost */}
        <span className="text-[10px] text-gray-500 font-mono hidden lg:block">
          {formatCurrencyUSD(groupStats.totalCost)}
        </span>

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

/**
 * PSMGroupedView - Main grouped card view container
 * PHASE 5: Grouping + Sorting Enhancement
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
  onBatchPO,
  actionsEnabled = true,
  categoriesMap,
  vendorsMap,
  tab,
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set(['all']));
  const [sortMode, setSortMode] = useState('exposure_desc');

  // Group items by mode
  const groups = useMemo(() => {
    const result = {};

    items.forEach(item => {
      let groupKey, groupName, inventoryState;

      if (groupMode === 'vendor') {
        groupKey = item.vendor?.id || 'unassigned';
        const vendorDisplay = resolveVendorDisplay(item.vendor?.id, item.vendor?.vendor_name || item.vendor_name, vendorsMap);
        groupName = vendorDisplay.name;
      } else if (groupMode === 'inventory') {
        // PHASE 5: Group by inventory state
        const toOrder = item.to_order ?? 0;
        const reserved = item.reserved_from_stock ?? 0;
        
        if (toOrder === 0) {
          inventoryState = 'IN_STOCK';
          groupName = '✓ In Stock';
        } else if (reserved > 0) {
          inventoryState = 'PARTIAL_STOCK';
          groupName = '~ Partial Stock';
        } else {
          inventoryState = 'OUT_OF_STOCK';
          groupName = '! Out of Stock';
        }
        groupKey = inventoryState;
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
          inventoryState,
          items: [],
        };
      }
      result[groupKey].items.push(item);
    });

    // Sort groups
    const sorted = Object.values(result);
    if (groupMode === 'inventory') {
      const order = { OUT_OF_STOCK: 0, PARTIAL_STOCK: 1, IN_STOCK: 2 };
      sorted.sort((a, b) => (order[a.inventoryState] ?? 3) - (order[b.inventoryState] ?? 3));
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
      {/* PHASE 5: Grouping + Sorting Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-gray-500" />
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
        
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-gray-500" />
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

      {/* Groups */}
      {groups.map(group => (
        <PSMGroupCard
          key={group.key}
          group={group}
          groupMode={groupMode}
          sortMode={sortMode}
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