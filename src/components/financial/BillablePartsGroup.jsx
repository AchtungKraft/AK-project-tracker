import React from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import BillablePartRow from "./BillablePartRow";

// Parts grouped by vendor (collapsed by default). Used for both current and projected parts.
export default function BillablePartsGroup({ groups, expandedGroups, toggleGroup, keyPrefix, sel }) {
  return groups.map((group) => {
    const gk = `${keyPrefix}:${group.vendor_name}`;
    const isExpanded = !!expandedGroups[gk];
    return (
      <div key={gk} className="border border-gray-700 rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 p-2.5 bg-gray-800/80 cursor-pointer hover:bg-gray-800" onClick={() => toggleGroup(gk)}>
          <Checkbox
            checked={sel.isGroupFullySelected(group.items)}
            ref={(el) => { if (el) el.indeterminate = sel.isGroupPartiallySelected(group.items); }}
            onCheckedChange={(checked) => (checked ? sel.selectGroup(group.items) : sel.deselectGroup(group.items))}
            onClick={(e) => e.stopPropagation()}
          />
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <Package className="w-4 h-4 text-blue-400" />
          <span className="font-medium text-white flex-1 text-sm truncate">{group.vendor_name}</span>
          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{group.items.length}</Badge>
          <span className="text-green-400 text-sm font-medium">{formatCurrencyUSD(group.total)}</span>
        </div>
        {isExpanded && (
          <div className="border-t border-gray-700">
            {group.items.map((item) => (
              <BillablePartRow key={sel.keyOf(item)} item={item} isSelected={sel.isSelected(item)} qty={sel.selectedQty(item)} onToggle={sel.toggle} onQtyChange={sel.qtyChange} />
            ))}
          </div>
        )}
      </div>
    );
  });
}