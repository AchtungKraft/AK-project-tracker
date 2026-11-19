import React from "react";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

export default function MarginBadge({ cost, retail }) {
  if (!retail || retail <= 0) return null;
  const margin = retail - (cost || 0);
  const pct = ((margin / retail) * 100).toFixed(1);
  const isNegative = margin < 0;
  return (
    <span className={cn("text-[10px] font-mono", isNegative ? "text-red-400" : "text-gray-500")}>
      {isNegative ? "−" : ""}{formatCurrencyUSD(Math.abs(margin))} ({pct}%)
    </span>
  );
}