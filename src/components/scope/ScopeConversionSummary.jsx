import React from "react";
import { Loader2 } from "lucide-react";
import { useScopeConversion } from "./ScopeConversionContext";

/** INTERNAL ONLY — compact conversion counts shown beside the convert button. */
export default function ScopeConversionSummary() {
  const ctx = useScopeConversion();
  if (!ctx) return null;
  if (!ctx.ready) return ctx.isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500 self-center" /> : null;

  const { approvedConverted, approvedRemaining, needsReview } = ctx.summary;
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400 self-center flex-wrap">
      <span><span className="text-emerald-300 font-medium">{approvedConverted}</span> converted</span>
      <span className="text-gray-600">·</span>
      <span><span className="text-amber-300 font-medium">{approvedRemaining}</span> remaining</span>
      <span className="text-gray-600">·</span>
      <span className={needsReview ? "text-red-300" : ""}><span className="font-medium">{needsReview}</span> needs review</span>
    </div>
  );
}