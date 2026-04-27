import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Truck,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

/**
 * BillableItemsSelector — UNIFIED selector for parts + services
 *
 * Uses resolveProjectBillableItems as SINGLE data source.
 * No more service-as-part mapping. No more getBillingAndProcurementStates dependency.
 *
 * SELECTION PAYLOAD:
 * {
 *   source_entity, source_id, type, description, qty, unit_price, line_total, ...
 * }
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

  // Group parts by vendor
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
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, error } = useProjectBillableItems(projectId);

  const { partGroups, services, allItems } = useMemo(() => {
    if (!data?.items) return { partGroups: [], services: [], allItems: [] };
    const items = data.items;
    const grouped = groupItems(items);
    return { ...grouped, allItems: items };
  }, [data]);

  // Auto-expand first group
  useEffect(() => {
    if (partGroups.length > 0 && Object.keys(expandedGroups).length === 0) {
      setExpandedGroups({ [partGroups[0].vendor_name]: true, __services__: true });
    }
  }, [partGroups]);

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Selection helpers
  const isSelected = (sourceId) => selectedItems.some(s => s.source_id === sourceId);

  const buildPayload = (item) => ({
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
  });

  const handleToggle = (item, checked) => {
    if (checked) {
      onSelectionChange([...selectedItems, buildPayload(item)]);
    } else {
      onSelectionChange(selectedItems.filter(s => s.source_id !== item.source_id));
    }
  };

  const handleSelectGroup = (items) => {
    const currentIds = new Set(selectedItems.map(s => s.source_id));
    const newItems = items.filter(i => !currentIds.has(i.source_id)).map(buildPayload);
    onSelectionChange([...selectedItems, ...newItems]);
  };

  const handleDeselectGroup = (items) => {
    const ids = new Set(items.map(i => i.source_id));
    onSelectionChange(selectedItems.filter(s => !ids.has(s.source_id)));
  };

  const isGroupFullySelected = (items) =>
    items.length > 0 && items.every(i => isSelected(i.source_id));
  const isGroupPartiallySelected = (items) => {
    const selected = items.filter(i => isSelected(i.source_id));
    return selected.length > 0 && selected.length < items.length;
  };

  // Filter by search
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
    return <div className="flex flex-col items-center justify-center h-40 text-gray-500"><Package className="w-8 h-8 mb-2 text-gray-600" /><p>No billable items available</p></div>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Summary */}
      {data?.summary && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg text-sm">
          <span className="text-gray-400">
            {data.summary.part_count} parts, {data.summary.service_count} services
          </span>
          <span className="text-green-400 font-medium">{formatCurrencyUSD(data.summary.grand_total)}</span>
        </div>
      )}

      <Input
        placeholder="Search items..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-gray-800 border-gray-700"
      />

      <div className="overflow-x-auto">
        <div className="space-y-2 min-w-full">
          {/* ── PARTS by vendor ── */}
          {filteredPartGroups.map((group) => {
            const isExpanded = expandedGroups[group.vendor_name];
            return (
              <div key={group.vendor_name} className="border border-gray-700 rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 p-3 bg-gray-800/80 cursor-pointer hover:bg-gray-800"
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
                  <span className="font-medium text-white flex-1">{group.vendor_name}</span>
                  <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{group.items.length}</Badge>
                  <span className="text-green-400 text-sm font-medium">{formatCurrencyUSD(group.total)}</span>
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-700">
                    {group.items.map((item) => (
                      <ItemRow key={item.source_id} item={item} isSelected={isSelected(item.source_id)} onToggle={handleToggle} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── SERVICES ── */}
          {filteredServices.length > 0 && (
            <div className="border border-amber-700/50 rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-2 p-3 bg-amber-900/20 cursor-pointer hover:bg-amber-900/30"
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
                <span className="font-medium text-amber-300 flex-1">Services</span>
                <Badge variant="outline" className="text-xs border-amber-700 text-amber-400">{filteredServices.length}</Badge>
                <span className="text-amber-400 text-sm font-medium">{formatCurrencyUSD(filteredServices.reduce((s, i) => s + i.line_total, 0))}</span>
              </div>
              {expandedGroups['__services__'] && (
                <div className="border-t border-amber-700/30">
                  {filteredServices.map((item) => (
                    <ItemRow key={item.source_id} item={item} isSelected={isSelected(item.source_id)} onToggle={handleToggle} isService />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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

function ItemRow({ item, isSelected, onToggle, isService = false }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 pl-10 hover:bg-gray-800/50")}>
      <Checkbox checked={isSelected} onCheckedChange={(checked) => onToggle(item, checked)} />
      {isService ? <Truck className="w-3 h-3 text-amber-500" /> : <Package className="w-3 h-3 text-gray-500" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">
          {item.description}
          {isService && <span className="ml-1.5 text-[10px] text-amber-400 font-mono">SERVICE</span>}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Qty: {item.qty_available_to_bill}</span>
          <span>×</span>
          <span>{formatCurrencyUSD(item.unit_price)}</span>
        </div>
        {item.needs_review && (
          <div className="flex items-center gap-1 text-xs text-amber-400 mt-0.5">
            <AlertTriangle className="w-3 h-3" />
            <span>{item.review_reason}</span>
          </div>
        )}
      </div>
      <div className="text-right">
        {isService && item.cost_total > 0 && (
          <p className="text-xs text-gray-500">Cost: {formatCurrencyUSD(item.cost_total)}</p>
        )}
        <p className="text-sm font-medium text-green-400">{formatCurrencyUSD(item.line_total)}</p>
      </div>
    </div>
  );
}