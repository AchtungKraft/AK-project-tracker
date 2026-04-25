import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EffectiveQtyBadge — Displays Required/Removed/Active quantity state
 * 
 * Shows compact "Active: 6 / 10 (4 removed)" when qty_removed > 0
 * Shows quantity violation indicator when integrity.quantity_violation is true
 */
export default function EffectiveQtyBadge({ commitment, compact = false }) {
  const required = commitment.required_total ?? 0;
  const removed = commitment.qty_removed ?? 0;
  const effective = commitment.effective_required ?? Math.max(0, required - removed);
  const integrity = commitment.integrity;
  const hasRemoval = removed > 0;
  const isBlocking = integrity?.quantity_violation === true || integrity?.blocking === true;

  if (!hasRemoval && !isBlocking) {
    // Simple display — just required
    return (
      <div className="text-center">
        <span className="text-gray-500 block text-[10px]">REQ</span>
        <span className="text-white font-mono text-[10px]">{required}</span>
      </div>
    );
  }

  return (
    <div className="text-center relative">
      <span className="text-gray-500 block text-[10px]">
        {hasRemoval ? 'ACTIVE' : 'REQ'}
      </span>
      <div className="flex items-center gap-1 justify-center">
        {isBlocking && (
          <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
        )}
        <span className={cn(
          "font-mono text-[10px]",
          isBlocking ? "text-red-400" : "text-white"
        )}>
          {effective}
        </span>
        {hasRemoval && (
          <span className="text-red-500/50 font-mono text-[8px]">/{required}</span>
        )}
      </div>
      {hasRemoval && !compact && (
        <span className="text-red-500/40 text-[8px] block">{removed} removed</span>
      )}
    </div>
  );
}

/**
 * IntegrityViolationBadge — Inline indicator for quantity violations
 * Shows "⚠ Qty violation" when integrity.quantity_violation is true
 * NEVER triggered by financial or structural conditions
 */
export function IntegrityViolationBadge({ commitment }) {
  const integrity = commitment.integrity;
  if (!integrity?.quantity_violation && !integrity?.blocking) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-700/50 whitespace-nowrap">
      <AlertTriangle className="w-3 h-3" />
      Qty violation
    </span>
  );
}