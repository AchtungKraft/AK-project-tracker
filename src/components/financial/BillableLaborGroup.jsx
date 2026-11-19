import React from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// Earned, uninvoiced billable labor (logged hours × task/project rate). Hours and rate come from the server.
export default function BillableLaborGroup({ items, expanded, onToggleExpand, isSelected, onToggle, allSelected, someSelected, onSelectAll, onDeselectAll }) {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.line_total, 0);
  return (
    <div className="border border-sky-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2.5 bg-sky-900/20 cursor-pointer hover:bg-sky-900/30" onClick={onToggleExpand}>
        <Checkbox
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected; }}
          onCheckedChange={(checked) => checked ? onSelectAll() : onDeselectAll()}
          onClick={(e) => e.stopPropagation()}
        />
        {expanded ? <ChevronDown className="w-4 h-4 text-sky-400" /> : <ChevronRight className="w-4 h-4 text-sky-400" />}
        <Clock className="w-4 h-4 text-sky-400" />
        <span className="font-medium text-sky-300 flex-1 text-sm">Earned Labor</span>
        <Badge variant="outline" className="text-xs border-sky-700 text-sky-400">{items.length}</Badge>
        <span className="text-sky-400 text-sm font-medium">{formatCurrencyUSD(total)}</span>
      </div>
      {expanded && (
        <div className="border-t border-sky-700/30">
          {items.map((item) => (
            <div key={item.source_id} className="flex items-center gap-2 px-3 py-2 pl-10 hover:bg-gray-800/50">
              <Checkbox checked={isSelected(item)} onCheckedChange={(checked) => onToggle(item, checked)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{item.task_name || item.description}</p>
                <p className="text-xs text-gray-500">
                  {item.qty_available_to_bill}h available × {formatCurrencyUSD(item.unit_price)}/h
                  {item.invoiced_qty > 0 && <span> · {item.invoiced_qty}h already invoiced</span>}
                  {item.qty_allocated > 0 && <span className="text-amber-400"> · {item.qty_allocated}h already on a draft (not included)</span>}
                </p>
              </div>
              <p className="text-sm font-medium text-sky-400 shrink-0">{formatCurrencyUSD(item.line_total)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}