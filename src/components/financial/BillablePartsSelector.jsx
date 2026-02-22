import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Building2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { useBillablePartsView } from "./useFinancialProjectsView";

/**
 * PHASE 4 — Billable Parts Selector UX
 * 
 * Shows grouped billable parts for a project.
 * Supports vendor or category grouping.
 * Only shows parts with remaining_to_bill > 0.
 */
export default function BillablePartsSelector({
  projectId,
  selectedItems,
  onSelectionChange,
  className,
}) {
  const [groupingMode, setGroupingMode] = useState("vendor");
  const [expandedGroups, setExpandedGroups] = useState({});

  const { data, isLoading, error } = useBillablePartsView(projectId, groupingMode);

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const handleToggleItem = (item, checked) => {
    if (checked) {
      onSelectionChange([
        ...selectedItems,
        {
          part_commitment_id: item.part_commitment_id,
          part_name: item.part_name,
          qty: item.qty_remaining_to_bill,
          unit_price: item.unit_price,
          line_total: item.remaining_to_bill,
        },
      ]);
    } else {
      onSelectionChange(
        selectedItems.filter((s) => s.part_commitment_id !== item.part_commitment_id)
      );
    }
  };

  const handleUpdateQty = (commitmentId, qty) => {
    const numQty = parseFloat(qty) || 0;
    onSelectionChange(
      selectedItems.map((s) =>
        s.part_commitment_id === commitmentId
          ? { ...s, qty: numQty, line_total: numQty * s.unit_price }
          : s
      )
    );
  };

  const handleSelectAll = (groupItems) => {
    const currentIds = selectedItems.map((s) => s.part_commitment_id);
    const newItems = groupItems
      .filter((item) => !currentIds.includes(item.part_commitment_id))
      .map((item) => ({
        part_commitment_id: item.part_commitment_id,
        part_name: item.part_name,
        qty: item.qty_remaining_to_bill,
        unit_price: item.unit_price,
        line_total: item.remaining_to_bill,
      }));
    onSelectionChange([...selectedItems, ...newItems]);
  };

  const handleDeselectAll = (groupItems) => {
    const groupIds = groupItems.map((item) => item.part_commitment_id);
    onSelectionChange(
      selectedItems.filter((s) => !groupIds.includes(s.part_commitment_id))
    );
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500">
        Select a project to view billable parts
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-40 text-red-400">
        Failed to load billable parts
      </div>
    );
  }

  const groups = data?.groups || [];

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-500">
        <Package className="w-8 h-8 mb-2 opacity-50" />
        <p>No parts remaining to bill</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Grouping Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Group by:</span>
        <div className="flex border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setGroupingMode("vendor")}
            className={cn(
              "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors",
              groupingMode === "vendor"
                ? "bg-red-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            )}
          >
            <Building2 className="w-3.5 h-3.5" />
            Vendor
          </button>
          <button
            onClick={() => setGroupingMode("category")}
            className={cn(
              "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors",
              groupingMode === "category"
                ? "bg-red-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Category
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
        <span className="text-sm text-gray-400">
          {data?.summary?.total_items || 0} parts available to bill
        </span>
        <span className="text-sm font-mono text-white">
          {formatCurrencyUSD(data?.summary?.total_remaining_to_bill || 0)} total
        </span>
      </div>

      {/* Grouped Parts List */}
      <ScrollArea className="h-[300px] border border-gray-700 rounded-lg">
        <div className="p-2 space-y-2">
          {groups.map((group) => {
            const isExpanded = expandedGroups[group.group_key] !== false; // Default expanded
            const selectedCount = group.items.filter((item) =>
              selectedItems.some((s) => s.part_commitment_id === item.part_commitment_id)
            ).length;
            const allSelected = selectedCount === group.items.length;

            return (
              <Collapsible
                key={group.group_key}
                open={isExpanded}
                onOpenChange={() => toggleGroup(group.group_key)}
              >
                <div className="border border-gray-700 rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                        <span className="text-white font-medium">{group.group_key}</span>
                        <Badge variant="secondary" className="text-xs">
                          {group.items.length}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedCount > 0 && (
                          <Badge className="bg-red-600/20 text-red-400 text-xs">
                            {selectedCount} selected
                          </Badge>
                        )}
                        <span className="text-sm font-mono text-gray-400">
                          {formatCurrencyUSD(group.group_total)}
                        </span>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-gray-700">
                      {/* Group Actions */}
                      <div className="flex items-center justify-end gap-2 p-2 bg-gray-900/50">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectAll(group.items)}
                          disabled={allSelected}
                          className="h-7 text-xs"
                        >
                          Select All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeselectAll(group.items)}
                          disabled={selectedCount === 0}
                          className="h-7 text-xs"
                        >
                          Deselect All
                        </Button>
                      </div>
                      {/* Items */}
                      {group.items.map((item) => {
                        const isSelected = selectedItems.some(
                          (s) => s.part_commitment_id === item.part_commitment_id
                        );
                        const selectedData = selectedItems.find(
                          (s) => s.part_commitment_id === item.part_commitment_id
                        );

                        return (
                          <div
                            key={item.part_commitment_id}
                            className={cn(
                              "flex items-center gap-3 p-3 border-t border-gray-800",
                              isSelected && "bg-red-900/10"
                            )}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleToggleItem(item, checked)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm truncate">{item.part_name}</p>
                              <p className="text-xs text-gray-500">
                                {item.qty_remaining_to_bill} × {formatCurrencyUSD(item.unit_price)}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0.01}
                                  max={item.qty_remaining_to_bill}
                                  step="any"
                                  value={selectedData?.qty ?? item.qty_remaining_to_bill}
                                  onChange={(e) =>
                                    handleUpdateQty(item.part_commitment_id, e.target.value)
                                  }
                                  className="w-20 h-8 text-right text-sm"
                                />
                                <span className="text-sm font-mono text-gray-400 w-24 text-right">
                                  {formatCurrencyUSD(selectedData?.line_total || 0)}
                                </span>
                              </div>
                            )}
                            {!isSelected && (
                              <span className="text-sm font-mono text-gray-500 w-24 text-right">
                                {formatCurrencyUSD(item.remaining_to_bill)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}