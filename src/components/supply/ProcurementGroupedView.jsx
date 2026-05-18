import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown, ChevronUp, Building2, FolderKanban, ShoppingCart,
  AlertTriangle, Package, ExternalLink, Warehouse
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { PSMItemRow } from "@/components/supply/PSMGroupedCards";
import resolveDefaultVendor from "@/components/supply/resolveDefaultVendor";

/**
 * ProcurementGroupedView — Flexible procurement grouping for GNO
 * 
 * Modes:
 * - 'vendor_project': Vendor → Project hierarchy (default, PO-batching focused)
 * - 'project_vendor': Project → Vendor hierarchy (PM/build coordination)
 * - 'vendor_only':    Vendor → flat parts (rapid consolidated ordering)
 * 
 * CANONICAL: Presentation ONLY — all data from getOpsSupplyView read model.
 * No local derivation. Selection always operates on commitment IDs.
 */

// ═══════════════════════════════════════════════════════════════
// GROUPING ENGINE — memoized, presentation-only
// ═══════════════════════════════════════════════════════════════

function resolveVendorKey(item, vendorSourcesByPart) {
  const resolved = resolveDefaultVendor(item, null, vendorSourcesByPart);
  return {
    id: resolved?.vendor_id || item.vendor_id || item.vendor?.id || 'unassigned',
    name: resolved?.vendor_name || item.vendor_name || item.vendor?.vendor_name || 'No Vendor',
  };
}

function resolveProjectKey(item) {
  const ds = item.demand_source || 'PROJECT';
  if (ds === 'STOCK_REPLENISHMENT' || ds === 'STOCK_MANUAL') {
    return { id: '__STOCK__', name: '📦 STOCK REPLENISHMENT' };
  }
  return {
    id: item.project_id || '__UNKNOWN__',
    name: item.project_name || 'Unknown Project',
  };
}

function buildVendorProjectGroups(items, vendorSourcesByPart) {
  const vendorMap = new Map();
  for (const item of items) {
    const v = resolveVendorKey(item, vendorSourcesByPart);
    const p = resolveProjectKey(item);
    if (!vendorMap.has(v.id)) {
      vendorMap.set(v.id, { id: v.id, name: v.name, subgroups: new Map(), items: [] });
    }
    const vendor = vendorMap.get(v.id);
    vendor.items.push(item);
    if (!vendor.subgroups.has(p.id)) {
      vendor.subgroups.set(p.id, { id: p.id, name: p.name, items: [] });
    }
    vendor.subgroups.get(p.id).items.push(item);
  }
  return Array.from(vendorMap.values())
    .map(v => ({ ...v, subgroups: Array.from(v.subgroups.values()) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildProjectVendorGroups(items, vendorSourcesByPart) {
  const projectMap = new Map();
  for (const item of items) {
    const p = resolveProjectKey(item);
    const v = resolveVendorKey(item, vendorSourcesByPart);
    if (!projectMap.has(p.id)) {
      projectMap.set(p.id, { id: p.id, name: p.name, subgroups: new Map(), items: [] });
    }
    const project = projectMap.get(p.id);
    project.items.push(item);
    if (!project.subgroups.has(v.id)) {
      project.subgroups.set(v.id, { id: v.id, name: v.name, items: [] });
    }
    project.subgroups.get(v.id).items.push(item);
  }
  return Array.from(projectMap.values())
    .map(p => ({ ...p, subgroups: Array.from(p.subgroups.values()) }))
    .sort((a, b) => {
      // Stock always last
      if (a.id === '__STOCK__') return 1;
      if (b.id === '__STOCK__') return -1;
      return a.name.localeCompare(b.name);
    });
}

function buildVendorOnlyGroups(items, vendorSourcesByPart) {
  const vendorMap = new Map();
  for (const item of items) {
    const v = resolveVendorKey(item, vendorSourcesByPart);
    if (!vendorMap.has(v.id)) {
      vendorMap.set(v.id, { id: v.id, name: v.name, subgroups: [], items: [] });
    }
    vendorMap.get(v.id).items.push(item);
  }
  return Array.from(vendorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ═══════════════════════════════════════════════════════════════
// GROUP SUMMARY — lightweight stats for header
// ═══════════════════════════════════════════════════════════════

function GroupSummary({ items }) {
  const toOrder = items.reduce((s, i) => s + (i.to_order ?? 0), 0);
  const cost = items.reduce((s, i) => s + (i.resolved_cost_total ?? i.estimated_cost ?? 0), 0);
  const blocked = items.filter(i => !i.is_orderable).length;
  return (
    <div className="hidden md:flex items-center gap-2 text-[10px] font-mono flex-shrink-0">
      <span className="text-gray-400">Qty <span className="text-red-400">{toOrder}</span></span>
      <span className="text-gray-400">Cost <span className="text-yellow-400">{formatCurrencyUSD(cost)}</span></span>
      {blocked > 0 && (
        <span className="text-amber-400">
          <AlertTriangle className="w-3 h-3 inline mr-0.5" />{blocked} blocked
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SELECTION HELPERS
// ═══════════════════════════════════════════════════════════════

function getOrderableIds(items) {
  return items.filter(c => c.allowed?.canCreatePO && (c.to_order ?? 0) > 0).map(c => c.id);
}

function useSelectionState(items, selectedItems) {
  const orderableIds = getOrderableIds(items);
  const allSelected = orderableIds.length > 0 && orderableIds.every(id => selectedItems.has(id));
  const someSelected = orderableIds.some(id => selectedItems.has(id));
  return { orderableIds, allSelected, someSelected };
}

// ═══════════════════════════════════════════════════════════════
// SUBGROUP ROW — nested section within a primary group
// ═══════════════════════════════════════════════════════════════

function SubgroupSection({
  subgroup, isProject, isExpanded, onToggle,
  selectedItems, onSelectAll, onItemSelect,
  onPartClick, onCreatePO, onReceive, onDeltaOrder, onResolveNeed, onBatchPO, actionsEnabled,
}) {
  const { orderableIds, allSelected, someSelected } = useSelectionState(subgroup.items, selectedItems);
  const Icon = isProject ? FolderKanban : Building2;
  const iconColor = isProject ? 'text-blue-400' : 'text-purple-400';
  const borderColor = isProject ? 'border-l-blue-600/40' : 'border-l-purple-600/40';

  return (
    <div className={cn("ml-4 border-l-2", borderColor)}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-800/20 transition-colors"
        onClick={onToggle}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAll(subgroup.items)}
          onClick={e => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />
        {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
        <Icon className={cn("w-3.5 h-3.5", iconColor)} />
        <span className="text-xs font-medium text-gray-300 flex-1 truncate">{subgroup.name}</span>
        <Badge variant="secondary" className="bg-gray-800/50 text-gray-400 text-[9px]">{subgroup.items.length}</Badge>
        <GroupSummary items={subgroup.items} />
      </div>
      {isExpanded && (
        <div className="ml-2">
          {subgroup.items.map(item => (
            <PSMItemRow
              key={item.id}
              commitment={item}
              isSelected={selectedItems.has(item.id)}
              onSelect={() => onItemSelect(item.id)}
              onPartClick={onPartClick}
              onCreatePO={onCreatePO}
              onReceive={onReceive}
              onDeltaOrder={onDeltaOrder}
              onResolveNeed={onResolveNeed}
              actionsEnabled={actionsEnabled}
              tab="buy"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRIMARY GROUP CARD
// ═══════════════════════════════════════════════════════════════

function PrimaryGroupCard({
  group, isProject, hasSubgroups, isExpanded, onToggle,
  expandedSubs, onToggleSub,
  selectedItems, onSelectAll, onItemSelect, onBatchGroup,
  onPartClick, onCreatePO, onReceive, onDeltaOrder, onResolveNeed, onBatchPO, actionsEnabled,
}) {
  const { orderableIds, allSelected, someSelected } = useSelectionState(group.items, selectedItems);
  const Icon = isProject ? FolderKanban : Building2;
  const iconColor = isProject ? 'text-blue-400' : 'text-purple-400';
  const borderColor = isProject ? '#3B82F6' : '#8B5CF6';
  const isStock = group.id === '__STOCK__';

  return (
    <Card className="bg-black/40 border-gray-800 overflow-hidden">
      <div
        className="flex items-center gap-2 p-2 md:p-3 cursor-pointer hover:bg-gray-800/30 transition-colors border-l-4"
        style={{ borderLeftColor: isStock ? '#F59E0B' : borderColor }}
        onClick={onToggle}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={() => onSelectAll(group.items)}
          onClick={e => e.stopPropagation()}
          disabled={orderableIds.length === 0}
        />
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        {isStock ? <Warehouse className="w-4 h-4 text-amber-400" /> : <Icon className={cn("w-4 h-4", iconColor)} />}
        <span className="text-sm font-semibold text-white flex-1 truncate">{group.name}</span>
        <Badge variant="secondary" className="bg-gray-800 text-gray-300 text-[10px]">
          {group.items.length} items
        </Badge>
        {hasSubgroups && (
          <Badge variant="outline" className="text-[9px] text-gray-500 border-gray-700">
            {group.subgroups.length} {isProject ? 'vendors' : 'projects'}
          </Badge>
        )}
        <GroupSummary items={group.items} />
        {orderableIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={e => { e.stopPropagation(); onBatchGroup(group.items); }}
            className="border-purple-700 text-purple-400 hover:bg-purple-900/30 h-6 text-[10px]"
          >
            <ShoppingCart className="w-3 h-3 mr-1" />
            Order All
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-gray-800">
          {hasSubgroups ? (
            group.subgroups.map(sub => (
              <SubgroupSection
                key={sub.id}
                subgroup={sub}
                isProject={!isProject}
                isExpanded={expandedSubs.has(sub.id)}
                onToggle={() => onToggleSub(sub.id)}
                selectedItems={selectedItems}
                onSelectAll={onSelectAll}
                onItemSelect={onItemSelect}
                onPartClick={onPartClick}
                onCreatePO={onCreatePO}
                onReceive={onReceive}
                onDeltaOrder={onDeltaOrder}
                onResolveNeed={onResolveNeed}
                onBatchPO={onBatchPO}
                actionsEnabled={actionsEnabled}
              />
            ))
          ) : (
            group.items.map(item => (
              <PSMItemRow
                key={item.id}
                commitment={item}
                isSelected={selectedItems.has(item.id)}
                onSelect={() => onItemSelect(item.id)}
                onPartClick={onPartClick}
                onCreatePO={onCreatePO}
                onReceive={onReceive}
                onDeltaOrder={onDeltaOrder}
                onResolveNeed={onResolveNeed}
                actionsEnabled={actionsEnabled}
                tab="buy"
              />
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

export default function ProcurementGroupedView({
  items,
  groupingMode = 'vendor_project',
  selectedItems,
  setSelectedItems,
  onPartClick,
  onCreatePO,
  onReceive,
  onDeltaOrder,
  onResolveNeed,
  onBatchPO,
  actionsEnabled = true,
  vendorSourcesByPart = {},
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set(['__ALL__']));
  const [expandedSubs, setExpandedSubs] = useState(new Set(['__ALL__']));

  // Build grouped data — MEMOIZED, presentation only
  const groups = useMemo(() => {
    if (groupingMode === 'project_vendor') return buildProjectVendorGroups(items, vendorSourcesByPart);
    if (groupingMode === 'vendor_only') return buildVendorOnlyGroups(items, vendorSourcesByPart);
    return buildVendorProjectGroups(items, vendorSourcesByPart);
  }, [items, groupingMode, vendorSourcesByPart]);

  const isGroupExpanded = (id) => expandedGroups.has('__ALL__') || expandedGroups.has(id);
  const isSubExpanded = (id) => expandedSubs.has('__ALL__') || expandedSubs.has(id);

  const toggleGroup = (id) => {
    setExpandedGroups(prev => {
      if (prev.has('__ALL__')) {
        const next = new Set(groups.map(g => g.id));
        next.delete(id);
        return next;
      }
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSub = (subId) => {
    setExpandedSubs(prev => {
      if (prev.has('__ALL__')) {
        // Expand all subs except toggled
        const all = new Set();
        groups.forEach(g => g.subgroups?.forEach(s => all.add(s.id)));
        all.delete(subId);
        return all;
      }
      const next = new Set(prev);
      next.has(subId) ? next.delete(subId) : next.add(subId);
      return next;
    });
  };

  const selectAll = (commitments) => {
    const ids = getOrderableIds(commitments);
    const allSelected = ids.length > 0 && ids.every(id => selectedItems.has(id));
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const selectItem = (id) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const batchGroup = (commitments) => {
    const ids = getOrderableIds(commitments);
    setSelectedItems(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
    setTimeout(() => onBatchPO?.(), 100);
  };

  const isProject = groupingMode === 'project_vendor';
  const hasSubgroups = groupingMode !== 'vendor_only';

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {groups.map(group => (
        <PrimaryGroupCard
          key={group.id}
          group={group}
          isProject={isProject}
          hasSubgroups={hasSubgroups && group.subgroups?.length > 0}
          isExpanded={isGroupExpanded(group.id)}
          onToggle={() => toggleGroup(group.id)}
          expandedSubs={expandedSubs.has('__ALL__') ? new Set(['__ALL__', ...(group.subgroups || []).map(s => s.id)]) : expandedSubs}
          onToggleSub={toggleSub}
          selectedItems={selectedItems}
          onSelectAll={selectAll}
          onItemSelect={selectItem}
          onBatchGroup={batchGroup}
          onPartClick={onPartClick}
          onCreatePO={onCreatePO}
          onReceive={onReceive}
          onDeltaOrder={onDeltaOrder}
          onResolveNeed={onResolveNeed}
          onBatchPO={onBatchPO}
          actionsEnabled={actionsEnabled}
        />
      ))}
    </div>
  );
}