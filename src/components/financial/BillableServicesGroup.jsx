import React from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Truck } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import BillableServiceRow from "./BillableServiceRow";

export default function BillableServicesGroup({ items, expanded, onToggleExpand, expandedServices, toggleServiceExpand, sel }) {
  if (!items.length) return null;
  return (
    <div className="border border-amber-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2.5 bg-amber-900/20 cursor-pointer hover:bg-amber-900/30" onClick={onToggleExpand}>
        <Checkbox
          checked={sel.isGroupFullySelected(items)}
          ref={(el) => { if (el) el.indeterminate = sel.isGroupPartiallySelected(items); }}
          onCheckedChange={(checked) => (checked ? sel.selectGroup(items) : sel.deselectGroup(items))}
          onClick={(e) => e.stopPropagation()}
        />
        {expanded ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-amber-400" />}
        <Truck className="w-4 h-4 text-amber-400" />
        <span className="font-medium text-amber-300 flex-1 text-sm">Services</span>
        <Badge variant="outline" className="text-xs border-amber-700 text-amber-400">{items.length}</Badge>
        <span className="text-amber-400 text-sm font-medium">{formatCurrencyUSD(items.reduce((s, i) => s + i.line_total, 0))}</span>
      </div>
      {expanded && (
        <div className="border-t border-amber-700/30">
          {items.map((item) => (
            <BillableServiceRow key={item.source_id} item={item} isSelected={sel.isSelected(item)} onToggle={sel.toggle}
              isChildExpanded={!!expandedServices[item.source_id]} onToggleExpand={() => toggleServiceExpand(item.source_id)} />
          ))}
        </div>
      )}
    </div>
  );
}