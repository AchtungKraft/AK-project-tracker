import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * IntegrityViolationSummary — Quantity violation summary banner (RED)
 * 
 * CONTRACT:
 * - RED banner = quantity violations ONLY → blocks actions
 * - Only appears when items have integrity.quantity_violation === true
 * - Financial conditions (cost_at_risk, invoiced<planned) NEVER appear here
 * - Structural recommendations (normalization) NEVER appear here
 */
export default function IntegrityViolationSummary({ items, onFilterViolations }) {
  const violationItems = items.filter(item => 
    item.integrity?.quantity_violation === true || item.integrity?.blocking === true
  );
  
  if (violationItems.length === 0) return null;

  return (
    <div className="bg-red-900/20 border border-red-700/50 rounded-lg px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-red-400 font-medium">
          Quantity integrity issue detected — {violationItems.length} item{violationItems.length !== 1 ? 's' : ''} affected
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Some items exceed allowed limits after removals. Actions are disabled until resolved.
        </p>
      </div>
      {onFilterViolations && (
        <button
          onClick={onFilterViolations}
          className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 whitespace-nowrap"
        >
          Show affected items
        </button>
      )}
    </div>
  );
}