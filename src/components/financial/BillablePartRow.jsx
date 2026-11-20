import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Package, AlertTriangle } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import MarginBadge from "./MarginBadge";
import LaborHoursInput from "./LaborHoursInput";
import PartPriceOverride from "./PartPriceOverride";

// One part row. Selected rows can bill part of the available qty; the server rejects anything above it.
// Projected rows show received / on-order qty; the price and cost shown are the estimated snapshots stored on the line.
export default function BillablePartRow({ item, isSelected, qty, onToggle, onQtyChange, override, onPriceChange }) {
  const unitCost = item.unit_cost ?? 0;
  const projected = item.metadata?.part_basis === "projected";
  const shownQty = isSelected ? (qty || 0) : item.qty_available_to_bill;
  const price = override?.unit_price ?? item.unit_price;
  return (
    <div className="flex items-center gap-2 px-3 py-2 pl-10 hover:bg-gray-800/50">
      <Checkbox checked={isSelected} onCheckedChange={(checked) => onToggle(item, checked)} />
      <Package className="w-3 h-3 text-gray-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{item.description}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <span>{item.qty_available_to_bill} available × {formatCurrencyUSD(item.unit_price)}{projected ? " est." : ""}</span>
          {unitCost > 0 && (<><span className="text-gray-600">|</span><span>{projected ? "Est. cost" : "Cost"}: {formatCurrencyUSD(unitCost)}</span><MarginBadge cost={unitCost} retail={item.unit_price} /></>)}
          {projected && <span>· received {item.metadata?.received_qty ?? 0}, on order {item.metadata?.on_order_qty ?? 0}</span>}
          {item.qty_allocated > 0 && <span className="text-amber-400">· {item.qty_allocated} already on a draft (not included)</span>}
        </div>
        {item.needs_review && (
          <div className="flex items-center gap-1 text-xs text-amber-400 mt-0.5"><AlertTriangle className="w-3 h-3" /><span>{item.review_reason}</span></div>
        )}
        {isSelected && onPriceChange && (
          <PartPriceOverride canonical={item.unit_price} unitCost={unitCost} override={override}
            onApply={(o) => onPriceChange(item, o)} onClear={() => onPriceChange(item, null)} />
        )}
      </div>
      {isSelected && <LaborHoursInput unit="qty" value={qty} max={item.qty_available_to_bill} onChange={(q) => onQtyChange(item, q)} />}
      <p className="text-sm font-medium text-green-400 shrink-0 w-20 text-right">{formatCurrencyUSD(shownQty * price)}</p>
    </div>
  );
}