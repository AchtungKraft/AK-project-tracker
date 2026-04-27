import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Truck,
  AlertTriangle,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * BillableItemsSelector — UNIFIED selector for parts + services
 *
 * PERFORMANCE:
 * - Groups collapsed by default (lazy expansion)
 * - Auto-select only for datasets < 50 items
 * - O(1) selection lookup via Set
 * - Memoized grouping + filtering
 *
 * SERVICE EXPANSION:
 * - Services with children show expandable line item breakdown
 */

function useProjectBillableItems(projectId) {
  return useQuery({
    queryKey: ["billableItems", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await base44.functions.invoke("resolveProjectBillableItems", { project_id: projectId });
      return res.data;
    },
    enabled: !!projectId,
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });
}

function groupItems(items) {
  const parts = items.filter(i => i.type === 'part');
  const services = items.filter(i => i.type === 'service');

  const vendorGroups = {};
  for (const item of parts) {
    const key = item.vendor_name || 'Unknown Vendor';
    if (!vendorGroups[key]) {
      vendorGroups[key] = { vendor_name: key, vendor_id: item.vendor_id, total: 0, items: [] };
    }
    vendorGroups[key].items.push(item);
    vendorGroups[key].total += item.line_total;
  }

  return {
    partGroups: Object.values(vendorGroups).sort((a, b) => {
      if (a.vendor_name === 'Unknown Vendor') return 1;
      if (b.vendor_name === 'Unknown Vendor') return -1;
      return a.vendor_name.localeCompare(b.vendor_name);
    }),
    services,
  };
}

export default function BillableItemsSelector({
  projectId,
  selectedItems,
  onSelectionChange,
  className,
}) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedServices, setExpandedServices] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  const { data, isLoading, error } = useProjectBillableItems(projectId);

  // Filter + group (memoized)
  const { partGroups, services, allItems } = useMemo(() => {
    if (!data?.items) return { partGroups: [], services: [], allItems: [] };
    const items = data.items.filter(i => i.line_total > 0 && i.qty_available_to_bill > 0);
    const grouped = groupItems(items);
    return { ...grouped, allItems: items };
  }, [data]);

  // O(1) selection lookup
  const selectedSet = useMemo(() => new Set(selectedItems.map(s => s.source_id)), [selectedItems]);

  // Build selection payload for an item
  const buildPayload = useCallback((item) => ({
    source_entity: item.source_entity,
    source_id: item.source_id,
    type: item.type,
    part_id: item.part_id,
    service_id: item.service_id || null,
    description: item.description,
    part_name: item.part_name || item.description,
    vendor_id: item.vendor_id,
    vendor_name: item.vendor_name,
    category_id: item.category_id,
    category_name: item.category_name,
    qty: item.qty_available_to_bill,
    unit_price: item.unit_price,
    line_total: item.line_total,
    cost_total: item.cost_total,
    net_exposure: item.line_total,
    gross_exposure: item.line_total,
    credit_applied: 0,
    needs_review: item.needs_review,
    review_reason: item.review_reason,
    children: item.children || null,
  }), []);

  // Auto-select: only for small datasets (<50), once per project
  useEffect(() => {
    if (allItems.length > 0 && selectedItems.length === 0 && !hasAutoSelected) {
      if (allItems.length < 50) {
        const seen = new Set();
        const initial = [];
        for (const item of allItems) {
          if (!seen.has(item.source_id)) {
            seen.add(item.source_id);
            initial.push(buildPayload(item));
          }
        }
        onSelectionChange(initial);
      }
      setHasAutoSelected(true);
    }
  }, [allItems, hasAutoSelected, selectedItems.length, buildPayload, onSelectionChange]);

  // Reset when project changes
  useEffect(() => {
    setHasAutoSelected(false);
    setExpandedGroups({});
    setExpandedServices({});
  }, [projectId]);

  // Performance warning
  useEffect(() => {
    if (allItems.length > 100) {
      console.warn(`[BillableItemsSelector] Large dataset: ${allItems.length} items`);
    }
  }, [allItems.length]);

  const toggleGroup = useCallback((key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleServiceExpand = useCallback((id) => {
    setExpandedServices(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Selection handlers
  const handleToggle = useCallback((item, checked) => {
    if (checked) {
      onSelectionChange([...selectedItems, buildPayload(item)]);
    } else {
      onSelectionChange(selectedItems.filter(s => s.source_id !== item.source_id));
    }
  }, [selectedItems, onSelectionChange, buildPayload]);

  const handleSelectAll = useCallback(() => {
    const seen = new Set(selectedItems.map(s => s.source_id));
    const newItems = allItems.filter(i => !seen.has(i.source_id)).map(buildPayload);
    onSelectionChange([...selectedItems, ...newItems]);
  }, [allItems, selectedItems, onSelectionChange, buildPayload]);

  const handleDeselectAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  const handleSelectGroup = useCallback((items) => {
    const currentIds = new Set(selectedItems.map(s => s.source_id));
    const newItems = items.filter(i => !currentIds.has(i.source_id)).map(buildPayload);
    onSelectionChange([...selectedItems, ...newItems]);
  }, [selectedItems, onSelectionChange, buildPayload]);

  const handleDeselectGroup = useCallback((items) => {
    const ids = new Set(items.map(i => i.source_id));
    onSelectionChange(selectedItems.filter(s => !ids.has(s.source_id)));
  }, [selectedItems, onSelectionChange]);

  const isGroupFullySelected = (items) =>
    items.length > 0 && items.every(i => selectedSet.has(i.source_id));
  const isGroupPartiallySelected = (items) => {
    const count = items.filter(i => selectedSet.has(i.source_id)).length;
    return count > 0 && count < items.length;
  };

  // Search filter (memoized)
  const filteredPartGroups = useMemo(() => {
    if (!searchTerm) return partGroups;
    const s = searchTerm.toLowerCase();
    return partGroups
      .map(g => ({ ...g, items: g.items.filter(i => i.description?.toLowerCase().includes(s)) }))
      .filter(g => g.items.length > 0);
  }, [partGroups, searchTerm]);

  const filteredServices = useMemo(() => {
    if (!searchTerm) return services;
    const s = searchTerm.toLowerCase();
    return services.filter(i => i.description?.toLowerCase().includes(s));
  }, [services, searchTerm]);

  // ── RENDER STATES ──
  if (!projectId) {
    return <div className="flex items-center justify-center h-40 text-gray-500">Select a project</div>;
  }
  if (isLoading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>;
  }
  if (error) {
    return <div className="flex items-center justify-center h-40 text-red-400"><AlertTriangle className="w-5 h-5 mr-2" />Failed to load</div>;
  }
  if (allItems.length === 0) {
    return <div className="flex flex-col items-center justify-center h-40 text-gray-500"><Package className="w-8 h-8 mb-2 text-gray-600" /><p>No billable items for this project</p></div>;
  }

  const allSelected = allItems.length > 0 && allItems.every(i => selectedSet.has(i.source_id));

  return (
    <div className={cn("space-y-3", className)}>
      {/* Summary + Select All */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg text-sm">
        <span className="text-gray-400">
          {data?.summary?.part_count || 0} parts, {data?.summary?.service_count || 0} services
        </span>
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-medium">{formatCurrencyUSD(data?.summary?.grand_total || 0)}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={allSelected ? handleDeselectAll : handleSelectAll}
            className="h-6 px-2 text-xs gap-1"
          >
            <CheckSquare className="w-3 h-3" />
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
        </div>
      </div>

      {searchTerm !== undefined && (
        <Input
          placeholder="Search items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-800 border-gray-700"
        />
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {/* ── PARTS by vendor (collapsed by default) ── */}
        {filteredPartGroups.map((group) => {
          const isExpanded = !!expandedGroups[group.vendor_name];
          return (
            <div key={group.vendor_name} className="border border-gray-700 rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-2 p-2.5 bg-gray-800/80 cursor-pointer hover:bg-gray-800"
                onClick={() => toggleGroup(group.vendor_name)}
              >
                <Checkbox
                  checked={isGroupFullySelected(group.items)}
                  ref={el => { if (el) el.indeterminate = isGroupPartiallySelected(group.items); }}
                  onCheckedChange={(checked) => checked ? handleSelectGroup(group.items) : handleDeselectGroup(group.items)}
                  onClick={(e) => e.stopPropagation()}
                />
                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <Package className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-white flex-1 text-sm">{group.vendor_name}</span>
                <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{group.items.length}</Badge>
                <span className="text-green-400 text-sm font-medium">{formatCurrencyUSD(group.total)}</span>
              </div>
              {isExpanded && (
                <div className="border-t border-gray-700">
                  {group.items.map((item) => (
                    <PartItemRow key={item.source_id} item={item} isSelected={selectedSet.has(item.source_id)} onToggle={handleToggle} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* ── SERVICES (collapsed by default) ── */}
        {filteredServices.length > 0 && (
          <div className="border border-amber-700/50 rounded-lg overflow-hidden">
            <div
              className="flex items-center gap-2 p-2.5 bg-amber-900/20 cursor-pointer hover:bg-amber-900/30"
              onClick={() => toggleGroup('__services__')}
            >
              <Checkbox
                checked={isGroupFullySelected(filteredServices)}
                ref={el => { if (el) el.indeterminate = isGroupPartiallySelected(filteredServices); }}
                onCheckedChange={(checked) => checked ? handleSelectGroup(filteredServices) : handleDeselectGroup(filteredServices)}
                onClick={(e) => e.stopPropagation()}
              />
              {expandedGroups['__services__'] ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-amber-400" />}
              <Truck className="w-4 h-4 text-amber-400" />
              <span className="font-medium text-amber-300 flex-1 text-sm">Services</span>
              <Badge variant="outline" className="text-xs border-amber-700 text-amber-400">{filteredServices.length}</Badge>
              <span className="text-amber-400 text-sm font-medium">{formatCurrencyUSD(filteredServices.reduce((s, i) => s + i.line_total, 0))}</span>
            </div>
            {expandedGroups['__services__'] && (
              <div className="border-t border-amber-700/30">
                {filteredServices.map((item) => (
                  <ServiceItemRow
                    key={item.source_id}
                    item={item}
                    isSelected={selectedSet.has(item.source_id)}
                    onToggle={handleToggle}
                    isChildExpanded={!!expandedServices[item.source_id]}
                    onToggleExpand={() => toggleServiceExpand(item.source_id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection Summary */}
      {selectedItems.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-green-900/20 border border-green-800/30 rounded-lg">
          <span className="text-green-400 text-sm">{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected</span>
          <span className="text-green-400 font-medium">{formatCurrencyUSD(selectedItems.reduce((s, i) => s + (i.line_total || 0), 0))}</span>
        </div>
      )}
    </div>
  );
}

// ── Margin helper ──
function MarginBadge({ cost, retail }) {
  if (!retail || retail <= 0) return null;
  const margin = retail - (cost || 0);
  const pct = ((margin / retail) * 100).toFixed(1);
  const isNegative = margin < 0;
  return (
    <span className={cn("text-[10px] font-mono", isNegative ? "text-red-400" : "text-gray-500")}>
      {isNegative ? "−" : ""}{formatCurrencyUSD(Math.abs(margin))} ({pct}%)
    </span>
  );
}

// ── Part row (with cost/retail/margin) ──
function PartItemRow({ item, isSelected, onToggle }) {
  const unitCost = item.unit_cost ?? 0;
  return (
    <div className="flex items-center gap-2 px-3 py-2 pl-10 hover:bg-gray-800/50">
      <Checkbox checked={isSelected} onCheckedChange={(checked) => onToggle(item, checked)} />
      <Package className="w-3 h-3 text-gray-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.description}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <span>Qty: {item.qty_available_to_bill}</span>
          <span>×</span>
          <span>{formatCurrencyUSD(item.unit_price)}</span>
          {unitCost > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <span>Cost: {formatCurrencyUSD(unitCost)}</span>
              <MarginBadge cost={unitCost} retail={item.unit_price} />
            </>
          )}
        </div>
        {item.needs_review && (
          <div className="flex items-center gap-1 text-xs text-amber-400 mt-0.5">
            <AlertTriangle className="w-3 h-3" />
            <span>{item.review_reason}</span>
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        {item.cost_total > 0 && (
          <p className="text-[10px] text-gray-500">Cost: {formatCurrencyUSD(item.cost_total)}</p>
        )}
        <p className="text-sm font-medium text-green-400">{formatCurrencyUSD(item.line_total)}</p>
      </div>
    </div>
  );
}

// ── Service row (with expandable children) ──
const ServiceItemRow = React.memo(function ServiceItemRow({ item, isSelected, onToggle, isChildExpanded, onToggleExpand }) {
  const hasChildren = item.children && item.children.length > 0;

  // Phase 5: Memoize children to avoid re-render on parent state changes
  const memoizedChildren = useMemo(() => item.children, [item.id]);

  // Phase 4: Validate children total matches parent
  const childrenSum = useMemo(() => {
    if (!hasChildren) return 0;
    return memoizedChildren.reduce((s, c) => s + (c.amount ?? 0), 0);
  }, [memoizedChildren, hasChildren]);

  const hasMismatch = hasChildren && Math.abs(childrenSum - item.line_total) > 0.01;

  // Log mismatch once (dev aid)
  useEffect(() => {
    if (hasMismatch) {
      console.error("Service total mismatch", {
        service_id: item.source_id,
        parent_total: item.line_total,
        children_sum: childrenSum,
        diff: childrenSum - item.line_total,
      });
    }
  }, [hasMismatch, item.source_id, item.line_total, childrenSum]);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 pl-10 hover:bg-gray-800/50">
        <Checkbox checked={isSelected} onCheckedChange={(checked) => onToggle(item, checked)} />
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="p-0">
            {isChildExpanded ? <ChevronDown className="w-3 h-3 text-amber-400" /> : <ChevronRight className="w-3 h-3 text-amber-400" />}
          </button>
        ) : (
          <Truck className="w-3 h-3 text-amber-500" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">
            {item.description}
            <span className="ml-1.5 text-[10px] text-amber-400 font-mono">SERVICE</span>
            {hasChildren && (
              <span className="ml-1 text-[10px] text-gray-500">({memoizedChildren.length} lines)</span>
            )}
          </p>
          {hasMismatch && (
            <div className="flex items-center gap-1 text-[10px] text-red-400 mt-0.5">
              <AlertTriangle className="w-3 h-3" />
              <span>Children total ({formatCurrencyUSD(childrenSum)}) ≠ parent ({formatCurrencyUSD(item.line_total)})</span>
            </div>
          )}
        </div>
        <div className="text-right">
          {item.cost_total > 0 && (
            <p className="text-xs text-gray-500">Cost: {formatCurrencyUSD(item.cost_total)}</p>
          )}
          <p className="text-sm font-medium text-amber-400">{formatCurrencyUSD(item.line_total)}</p>
        </div>
      </div>

      {/* Expanded children */}
      {hasChildren && isChildExpanded && (
        <div className="ml-14 mr-3 mb-2 border-l-2 border-amber-800/30 pl-3 space-y-1">
          {memoizedChildren.map((child) => (
            <div key={child.id} className="flex items-center justify-between py-1 text-xs">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-gray-500">↳</span>
                <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400 px-1 py-0 h-4 shrink-0">
                  {child.type}
                </Badge>
                <span className="text-gray-300 truncate">{child.description}</span>
                {child.vendor_name && (
                  <span className="text-gray-500 truncate">({child.vendor_name})</span>
                )}
              </div>
              <div className="text-right shrink-0 ml-2 flex items-center gap-2">
                {child.cost_amount > 0 && (
                  <span className="text-gray-500">Cost: {formatCurrencyUSD(child.cost_amount)}</span>
                )}
                <span className="text-amber-300 font-mono">{formatCurrencyUSD(child.amount)}</span>
                {child.cost_amount > 0 && child.amount > 0 && (
                  <MarginBadge cost={child.cost_amount} retail={child.amount} />
                )}
              </div>
            </div>
          ))}
          {/* Children total footer */}
          <div className="flex items-center justify-between pt-1 border-t border-amber-800/20">
            <span className="text-[10px] text-gray-500">Children total</span>
            <span className={cn("text-[10px] font-mono", hasMismatch ? "text-red-400" : "text-amber-300")}>
              {formatCurrencyUSD(childrenSum)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});