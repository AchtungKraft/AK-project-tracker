import React, { useMemo, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Truck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import MarginBadge from "./MarginBadge";

// Service row with expandable line-item children.
const BillableServiceRow = React.memo(function BillableServiceRow({ item, isSelected, onToggle, isChildExpanded, onToggleExpand }) {
  const hasChildren = item.children && item.children.length > 0;
  const memoizedChildren = useMemo(() => item.children, [item.id]);
  const childrenSum = useMemo(() => (hasChildren ? memoizedChildren.reduce((s, c) => s + (c.amount ?? 0), 0) : 0), [memoizedChildren, hasChildren]);
  const hasMismatch = hasChildren && Math.abs(childrenSum - item.line_total) > 0.01;

  useEffect(() => {
    if (hasMismatch) console.error("Service total mismatch", { service_id: item.source_id, parent_total: item.line_total, children_sum: childrenSum, diff: childrenSum - item.line_total });
  }, [hasMismatch, item.source_id, item.line_total, childrenSum]);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 pl-10 hover:bg-gray-800/50">
        <Checkbox checked={isSelected} onCheckedChange={(checked) => onToggle(item, checked)} />
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="p-0">
            {isChildExpanded ? <ChevronDown className="w-3 h-3 text-amber-400" /> : <ChevronRight className="w-3 h-3 text-amber-400" />}
          </button>
        ) : <Truck className="w-3 h-3 text-amber-500" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">
            {item.description}
            <span className="ml-1.5 text-[10px] text-amber-400 font-mono">SERVICE</span>
            {hasChildren && <span className="ml-1 text-[10px] text-gray-500">({memoizedChildren.length} lines)</span>}
          </p>
          {hasMismatch && (
            <div className="flex items-center gap-1 text-[10px] text-red-400 mt-0.5">
              <AlertTriangle className="w-3 h-3" />
              <span>Children total ({formatCurrencyUSD(childrenSum)}) ≠ parent ({formatCurrencyUSD(item.line_total)})</span>
            </div>
          )}
        </div>
        <div className="text-right">
          {item.cost_total > 0 && <p className="text-xs text-gray-500">Cost: {formatCurrencyUSD(item.cost_total)}</p>}
          <p className="text-sm font-medium text-amber-400">{formatCurrencyUSD(item.line_total)}</p>
        </div>
      </div>
      {hasChildren && isChildExpanded && (
        <div className="ml-14 mr-3 mb-2 border-l-2 border-amber-800/30 pl-3 space-y-1">
          {memoizedChildren.map((child) => (
            <div key={child.id} className="flex items-center justify-between py-1 text-xs">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-gray-500">↳</span>
                <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400 px-1 py-0 h-4 shrink-0">{child.type}</Badge>
                <span className="text-gray-300 truncate">{child.description}</span>
                {child.vendor_name && <span className="text-gray-500 truncate">({child.vendor_name})</span>}
              </div>
              <div className="text-right shrink-0 ml-2 flex items-center gap-2">
                {child.cost_amount > 0 && <span className="text-gray-500">Cost: {formatCurrencyUSD(child.cost_amount)}</span>}
                <span className="text-amber-300 font-mono">{formatCurrencyUSD(child.amount)}</span>
                {child.cost_amount > 0 && child.amount > 0 && <MarginBadge cost={child.cost_amount} retail={child.amount} />}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t border-amber-800/20">
            <span className="text-[10px] text-gray-500">Children total</span>
            <span className={cn("text-[10px] font-mono", hasMismatch ? "text-red-400" : "text-amber-300")}>{formatCurrencyUSD(childrenSum)}</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default BillableServiceRow;