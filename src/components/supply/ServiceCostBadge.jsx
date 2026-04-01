import React from "react";
import { cn } from "@/lib/utils";

/**
 * ServiceCostBadge - Cost source badges for ServiceCommitments
 * 
 * Mirrors part pricing pattern for services:
 * - COST SET        (green)  — has cost > 0
 * - COST PENDING    (gray)   — no cost yet
 * - BILLED          (blue)   — billed status
 */
const CONFIGS = {
  COST_SET:      { label: 'COST SET',     border: 'border-l-emerald-600', text: 'text-emerald-500/80' },
  COST_PENDING:  { label: 'COST PENDING', border: 'border-l-gray-600',    text: 'text-gray-500' },
  BILLED:        { label: 'BILLED',       border: 'border-l-blue-600',    text: 'text-blue-400/80' },
};

export default function ServiceCostBadge({ commitment, className }) {
  if (!commitment) return null;

  const totalCost = commitment.total_cost > 0 ? commitment.total_cost : (commitment.actual_cost ?? commitment.estimated_cost ?? 0);
  const status = commitment.status || 'planned';

  let config;
  if (status === 'billed') {
    config = CONFIGS.BILLED;
  } else if (totalCost > 0) {
    config = CONFIGS.COST_SET;
  } else {
    config = CONFIGS.COST_PENDING;
  }

  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
      "bg-gray-900/60 border-l-2",
      config.border, config.text, className
    )}>
      {config.label}
    </span>
  );
}