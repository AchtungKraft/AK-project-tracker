import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";
import { format } from "date-fns";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const STATUS = {
  active: "bg-emerald-600/20 text-emerald-400",
  partially_reversed: "bg-amber-600/20 text-amber-400",
  reversed: "bg-gray-700/60 text-gray-400",
  incomplete: "bg-red-600/20 text-red-400",
};
const fmt = (d) => (d ? format(new Date(d), "MMM d, yyyy h:mm a") : "");

export default function SettlementHistoryRow({ s, onReverse }) {
  return (
    <div className="p-2 rounded border border-gray-700 bg-gray-800/40 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-gray-200 truncate">{s.part_name || "Part"}</p>
          <p className="text-gray-500">{fmt(s.recorded_at)}{s.actor_email ? ` · ${s.actor_email}` : ""}{s.legacy ? " · older record" : ""}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-gray-300 font-medium">{formatCurrencyUSD(s.net_amount)}</span>
          {s.reversed_amount > 0 && <span className="text-gray-500 line-through">{formatCurrencyUSD(s.amount)}</span>}
          <Badge className={`text-[10px] ${STATUS[s.status] || STATUS.active}`}>{s.status.replace("_", " ")}</Badge>
          <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled={!s.reversible} title={s.block_reason || "Reverse"} onClick={() => onReverse(s)}>
            <Undo2 className="w-3 h-3" /> Reverse
          </Button>
        </div>
      </div>
      {!s.reversible && s.block_reason && s.status !== "reversed" && <p className="mt-1 text-gray-500">{s.block_reason}</p>}
      {s.reversals.map((r) => (
        <p key={r.id} className="mt-1 text-amber-300/80">
          Reversed {formatCurrencyUSD(r.amount)} on {fmt(r.at)} by {r.by}: {r.reason}
        </p>
      ))}
    </div>
  );
}