import React from "react";
import { format, parseISO } from "date-fns";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

export default function PaymentHistoryRow({ payment: p, canReverse, onReverse }) {
  const reversed = !!p.reversed_at;
  return (
    <div className="px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className={`w-24 shrink-0 ${reversed ? "text-gray-500" : "text-gray-300"}`}>{format(parseISO(p.payment_date), "MMM d, yyyy")}</span>
        <span className="flex-1 min-w-0 truncate text-gray-400">
          <span className="uppercase text-xs">{p.method}</span>{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}
        </span>
        <span className={`font-mono ${reversed ? "text-gray-500 line-through" : "text-green-400"}`}>{formatCurrencyUSD(p.amount_cents / 100)}</span>
        {canReverse && !reversed && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-400 hover:text-red-400" onClick={() => onReverse(p)} aria-label="Reverse payment">
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-0.5">Recorded by {p.recorded_by_email}</p>
      {reversed && (
        <p className="text-xs text-red-400/90 mt-0.5">
          Reversed {format(parseISO(p.reversed_at), "MMM d, yyyy h:mm a")} by {p.reversed_by_email}: {p.reversal_reason}
        </p>
      )}
    </div>
  );
}