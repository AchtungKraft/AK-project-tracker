import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeLaborBreakdown } from "./scopeHelpers";
import { mergeAgg, formatAgg } from "./scopeEstimate";

/**
 * Expandable AK Labor Breakdown panel for the top summary area.
 * Shows labor totals by group, optionally filtered to approved items.
 */
export default function LaborBreakdownPanel({ items = [], laborEstimates = [], isMobile = false }) {
  const [expanded, setExpanded] = useState(false);
  const [showApproved, setShowApproved] = useState(true);

  if (!laborEstimates.length) return null;

  const approvedItems = items.filter(i => i.decision_status === 'approved');
  const displayItems = showApproved ? approvedItems : items;
  const breakdown = computeLaborBreakdown(displayItems, laborEstimates);
  
  if (breakdown.length === 0) return null;

  const totalHours = formatAgg(mergeAgg(...breakdown.map(g => g.agg.hours)), 'hours');
  const totalCost = formatAgg(mergeAgg(...breakdown.map(g => g.agg.dollars)));

  return (
    <Card className="border-red-900/30 bg-red-950/10">
      <CardContent className={cn("space-y-2", isMobile ? "p-3" : "p-4")}>
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left">
          <Clock className="w-4 h-4 text-red-400" />
          <span className="text-sm font-semibold text-red-300">AK Labor Breakdown</span>
          <span className="text-xs text-gray-500 ml-2">
            {[totalHours, totalCost].filter(Boolean).join(' · ')}
          </span>
          <span className="ml-auto">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </span>
        </button>

        {expanded && (
          <>
            <div className="flex gap-2 text-[10px]">
              <button onClick={() => setShowApproved(true)} className={cn("px-2 py-0.5 rounded", showApproved ? "bg-green-900/40 text-green-400" : "text-gray-500 hover:text-gray-300")}>
                Approved Scope
              </button>
              <button onClick={() => setShowApproved(false)} className={cn("px-2 py-0.5 rounded", !showApproved ? "bg-gray-700/40 text-gray-300" : "text-gray-500 hover:text-gray-300")}>
                All Scope
              </button>
            </div>

            <div className="space-y-1">
              {breakdown.map(g => (
                <div key={g.labor_group_id} className="flex items-center justify-between py-1 border-b border-gray-800/40 last:border-0">
                  <span className="text-xs text-gray-300 font-medium">{g.name}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">{g.hours_label}</span>
                    <span className="text-emerald-400 font-medium">{g.cost_label}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-red-900/30">
                <span className="text-xs text-red-300 font-bold">TOTAL</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-white font-bold">{totalHours}</span>
                  <span className="text-emerald-400 font-bold">{totalCost}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}