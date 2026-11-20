import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// Admin price override for one selected part line. Only the invoice line changes; the part, project price,
// purchasing cost and inventory stay as they are. The server re-validates everything and records who, when and why.
export default function PartPriceOverride({ canonical, unitCost, override, onApply, onClear }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(override ? String(override.unit_price) : String(canonical));
  const [reason, setReason] = useState(override?.reason || "");
  const [belowOk, setBelowOk] = useState(!!override?.below_cost_approved);

  if (override && !open) {
    return (
      <div className="text-xs text-amber-300 flex flex-wrap items-center gap-x-2">
        <span>Override {formatCurrencyUSD(override.unit_price)} (was {formatCurrencyUSD(canonical)}) · {override.reason}</span>
        <button className="underline text-gray-400" onClick={() => setOpen(true)}>Edit</button>
        <button className="underline text-gray-400" onClick={onClear}>Use standard price</button>
      </div>
    );
  }
  if (!open) return <button className="text-xs text-gray-400 underline" onClick={() => setOpen(true)}>Override price</button>;

  const p = Number(price);
  const cents = /^\d+(\.\d{1,2})?$/.test(price.trim());
  const belowCost = cents && unitCost > 0 && p < unitCost;
  const margin = cents && p > 0 ? Math.round(((p - unitCost) / p) * 1000) / 10 : null;
  const changed = cents && Math.abs(p - canonical) >= 0.005;
  const valid = changed && reason.trim().length >= 5 && reason.trim().length <= 500 && (!belowCost || belowOk);

  return (
    <div className="mt-1 space-y-1.5 rounded border border-gray-700 bg-gray-900 p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>Standard {formatCurrencyUSD(canonical)}</span>
        <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="h-7 w-28 bg-gray-800 border-gray-700 text-xs" aria-label="Override selling price" />
        {margin != null && <span className={belowCost ? "text-red-400" : "text-gray-400"}>Margin {margin}%{belowCost ? " · below cost" : ""}</span>}
        {!cents && <span className="text-red-400">Use dollars and cents, e.g. 125.50</span>}
      </div>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the override (required)" className="h-7 bg-gray-800 border-gray-700 text-xs" />
      {belowCost && (
        <label className="flex items-center gap-2 text-xs text-red-300">
          <Checkbox checked={belowOk} onCheckedChange={(v) => setBelowOk(!!v)} />I approve selling below cost ({formatCurrencyUSD(unitCost)})
        </label>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" disabled={!valid} onClick={() => { onApply({ unit_price: Math.round(p * 100) / 100, reason: reason.trim(), below_cost_approved: belowCost && belowOk }); setOpen(false); }}>Apply</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}