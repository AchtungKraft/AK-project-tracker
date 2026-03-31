import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { resolveNextAction } from "./CommitmentNextAction";
import CommitmentNextAction from "./CommitmentNextAction";
import { formatCurrencyUSD } from "./pricingHelpers";

/**
 * CommitmentActionCard - Task-oriented commitment display
 * Shows canonical quantities + prominent next action button.
 * Used in both project supply view and global action queue.
 */

function QtyChip({ label, value, color, show = true }) {
  if (!show || value === 0) return null;
  return (
    <div className="text-center min-w-[40px]">
      <div className="text-[9px] text-gray-500 uppercase">{label}</div>
      <div className={cn("text-xs font-mono font-medium", color)}>{value}</div>
    </div>
  );
}

export default function CommitmentActionCard({
  commitment,
  isSelected,
  onSelect,
  onAction,
  onPartClick,
  isLoading,
  showProject = false,
  compact = false,
}) {
  const rt = commitment.required_total ?? 0;
  const rfs = commitment.reserved_from_stock ?? 0;
  const cfp = commitment.covered_from_po ?? 0;
  const qi = commitment.qty_installed ?? 0;
  const gap = Math.max(0, rt - rfs - cfp);
  const { action } = resolveNextAction(commitment);
  const part = commitment.part;
  const isComplete = action === 'COMPLETE';
  const isCancelled = commitment.commitment_status === 'cancelled';

  // Border color based on next action
  const borderColor = {
    ALLOCATE: 'border-l-cyan-500',
    CREATE_PO: 'border-l-blue-500',
    RECEIVE: 'border-l-purple-500',
    INSTALL: 'border-l-emerald-500',
    COMPLETE: 'border-l-gray-600',
    BLOCKED: 'border-l-red-500',
    CANCELLED: 'border-l-gray-700',
  }[action] || 'border-l-gray-700';

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 md:p-3 border-b border-gray-800/50 last:border-b-0 transition-colors",
      "hover:bg-gray-800/20 border-l-3",
      borderColor,
      isCancelled && "opacity-40",
      isComplete && "opacity-70"
    )}>
      {/* Selection */}
      <Checkbox
        checked={isSelected}
        onCheckedChange={onSelect}
        className="flex-shrink-0"
      />

      {/* Part thumbnail */}
      {part?.featured_photo && !compact && (
        <div className="w-8 h-8 bg-gray-800 rounded flex-shrink-0 overflow-hidden hidden sm:block">
          <img src={part.featured_photo} alt="" className="w-full h-full object-contain" />
        </div>
      )}

      {/* Part info */}
      <button
        onClick={() => onPartClick?.(part, commitment)}
        className="flex-1 min-w-0 text-left hover:text-gray-300"
      >
        <p className="text-white text-sm font-medium truncate">{part?.part_name || 'Unknown Part'}</p>
        <div className="flex items-center gap-1 text-[10px] text-gray-500 truncate">
          {part?.vendor_part_number && <span className="font-mono">{part.vendor_part_number}</span>}
          {showProject && commitment.project_name && (
            <><span>·</span><span className="text-blue-400/70 truncate">{commitment.project_name}</span></>
          )}
        </div>
      </button>

      {/* Canonical quantity chips */}
      <div className="hidden md:flex items-center gap-2 flex-shrink-0">
        <QtyChip label="REQ" value={rt} color="text-white" />
        <QtyChip label="RSV" value={rfs} color="text-cyan-400" show={rfs > 0} />
        <QtyChip label="ORD" value={cfp} color="text-purple-400" show={cfp > 0} />
        <QtyChip label="INST" value={qi} color="text-emerald-400" show={qi > 0} />
        <QtyChip label="GAP" value={gap} color="text-red-400" show={gap > 0} />
      </div>

      {/* Mobile quantities */}
      <div className="flex md:hidden items-center gap-1 text-[10px] font-mono flex-shrink-0">
        <span className="text-gray-400">{qi}/{rt}</span>
        {gap > 0 && <span className="text-red-400">(-{gap})</span>}
      </div>

      {/* Retail total */}
      {!compact && (commitment.planned_retail_total ?? 0) > 0 && (
        <div className="hidden lg:block text-[10px] font-mono text-gray-400 flex-shrink-0">
          {formatCurrencyUSD(commitment.planned_retail_total)}
        </div>
      )}

      {/* PRIMARY: Next Action Button */}
      <div className="flex-shrink-0">
        <CommitmentNextAction
          commitment={commitment}
          onAction={onAction}
          isLoading={isLoading}
          size="sm"
        />
      </div>
    </div>
  );
}