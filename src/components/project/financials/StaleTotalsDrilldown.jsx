import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { money } from "./finFormat";

const KIND = { price_entered_later: "Price entered after creation", quantity_changed: "Quantity changed", other: "Unclassified" };

// Read-only list of part lines whose stored sale total differs from the calculated value.
export default function StaleTotalsDrilldown({ parts }) {
  const [open, setOpen] = useState(false);
  const rows = (parts || []).filter((p) => p.stale_detail);
  if (!rows.length) return null;
  return (
    <div className="ml-6">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {open ? "Hide" : "Show"} affected lines ({rows.length})
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs text-gray-300">
            <thead className="text-[10px] uppercase text-gray-500">
              <tr>
                <th className="text-left py-1">Part</th><th className="text-right">Stored</th><th className="text-right">Calculated</th>
                <th className="text-right">Difference</th><th className="text-left pl-3">Calculated from</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-amber-900/30 align-top">
                  <td className="py-1.5 pr-2 text-white">{r.part_name || "Unknown part"}{r.part_number && <div className="text-gray-500">{r.part_number}</div>}</td>
                  <td className="text-right tabular-nums">{money(r.stale_detail.stored)}</td>
                  <td className="text-right tabular-nums">{money(r.stale_detail.calculated)}</td>
                  <td className={`text-right tabular-nums ${r.stale_detail.difference < 0 ? "text-red-400" : "text-green-400"}`}>{money(r.stale_detail.difference)}</td>
                  <td className="pl-3 text-gray-400">
                    <span className="text-gray-200">{KIND[r.stale_detail.kind] || KIND.other}</span>
                    {r.stale_detail.kind === "quantity_changed" && ` (saved for qty ${r.stale_detail.stored_qty_implied})`}<br />
                    Qty: {r.stale_detail.qty_source}<br />Price: {r.stale_detail.price_source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-500 mt-1">Stored values are not changed. The calculated value is what the overview uses.</p>
        </div>
      )}
    </div>
  );
}