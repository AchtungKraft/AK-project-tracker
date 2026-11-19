import React from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import LaborHoursInput from "./LaborHoursInput";

// Billable labor (earned from logged hours, or projected against estimates). Rate and available hours come from the
// server; selected rows can bill part of the available hours. The server rejects anything above what is available.
export default function BillableLaborGroup({ items, projected = false, expanded, onToggleExpand, isSelected, selectedQty, onQtyChange, onToggle, allSelected, someSelected, onSelectAll, onDeselectAll }) {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.line_total, 0);
  const tone = projected ? "violet" : "sky";
  return (
    <div className={projected ? "border border-violet-700/50 rounded-lg overflow-hidden" : "border border-sky-700/50 rounded-lg overflow-hidden"}>
      <div className={projected ? "flex items-center gap-2 p-2.5 bg-violet-900/20 cursor-pointer hover:bg-violet-900/30" : "flex items-center gap-2 p-2.5 bg-sky-900/20 cursor-pointer hover:bg-sky-900/30"} onClick={onToggleExpand}>
        <Checkbox
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected; }}
          onCheckedChange={(checked) => checked ? onSelectAll() : onDeselectAll()}
          onClick={(e) => e.stopPropagation()}
        />
        {expanded ? <ChevronDown className={projected ? "w-4 h-4 text-violet-400" : "w-4 h-4 text-sky-400"} /> : <ChevronRight className={projected ? "w-4 h-4 text-violet-400" : "w-4 h-4 text-sky-400"} />}
        <Clock className={projected ? "w-4 h-4 text-violet-400" : "w-4 h-4 text-sky-400"} />
        <span className={projected ? "font-medium text-violet-300 flex-1 text-sm" : "font-medium text-sky-300 flex-1 text-sm"}>
          {projected ? "Projected Labor (advance billing)" : "Earned Labor"}
        </span>
        <Badge variant="outline" className={projected ? "text-xs border-violet-700 text-violet-400" : "text-xs border-sky-700 text-sky-400"}>{items.length}</Badge>
        <span className={projected ? "text-violet-400 text-sm font-medium" : "text-sky-400 text-sm font-medium"}>{formatCurrencyUSD(total)}</span>
      </div>
      {expanded && (
        <div className={projected ? "border-t border-violet-700/30" : "border-t border-sky-700/30"}>
          {projected && <p className="px-3 pt-2 text-[11px] text-gray-500">Bills estimated hours not yet logged. Hours billed in advance are applied first against hours logged later.</p>}
          {items.map((item) => {
            const sel = isSelected(item);
            return (
              <div key={item.selection_key || item.source_id} className="flex items-center gap-2 px-3 py-2 pl-10 hover:bg-gray-800/50">
                <Checkbox checked={sel} onCheckedChange={(checked) => onToggle(item, checked)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.task_name || item.description}</p>
                  <p className="text-xs text-gray-500">
                    {item.qty_available_to_bill}h available × {formatCurrencyUSD(item.unit_price)}/h
                    {projected && item.metadata?.estimated_hours != null && <span> · estimate {item.metadata.estimated_hours}h, logged {item.metadata.hours_logged}h</span>}
                    {!projected && item.invoiced_qty > 0 && <span> · {item.invoiced_qty}h already invoiced</span>}
                    {item.qty_allocated > 0 && <span className="text-amber-400"> · {item.qty_allocated}h already on a draft (not included)</span>}
                  </p>
                </div>
                {sel && <LaborHoursInput value={selectedQty(item)} max={item.qty_available_to_bill} onChange={(h) => onQtyChange(item, h)} />}
                <p className={tone === "violet" ? "text-sm font-medium text-violet-400 shrink-0 w-20 text-right" : "text-sm font-medium text-sky-400 shrink-0 w-20 text-right"}>
                  {formatCurrencyUSD(sel ? (selectedQty(item) || 0) * item.unit_price : item.line_total)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}