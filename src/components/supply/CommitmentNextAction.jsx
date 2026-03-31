import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShoppingCart, Package, Wrench, CheckCircle2, AlertTriangle, Layers, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CommitmentNextAction - Determines and renders the single primary next action
 * for a commitment based on canonical fields from resolveCommitmentState.
 * 
 * Priority chain:
 * 1. CANCELLED/CLOSED → no action
 * 2. qty_installed >= required_total → COMPLETE
 * 3. reserved > 0 && reserved > installed → INSTALL
 * 4. covered_from_po > 0 && on PO → RECEIVE (if PO lines have unreceived)
 * 5. gap > 0 → CREATE_PO (or ALLOCATE if stock available)
 * 6. Fallback → COMPLETE
 */

const NEXT_ACTIONS = {
  ALLOCATE: { label: "Allocate Stock", icon: Layers, color: "bg-cyan-600 hover:bg-cyan-700", badgeColor: "bg-cyan-900/50 text-cyan-400 border-cyan-700/50" },
  CREATE_PO: { label: "Create PO", icon: ShoppingCart, color: "bg-blue-600 hover:bg-blue-700", badgeColor: "bg-blue-900/50 text-blue-400 border-blue-700/50" },
  RECEIVE: { label: "Receive Items", icon: Package, color: "bg-purple-600 hover:bg-purple-700", badgeColor: "bg-purple-900/50 text-purple-400 border-purple-700/50" },
  INSTALL: { label: "Install Part", icon: Wrench, color: "bg-emerald-600 hover:bg-emerald-700", badgeColor: "bg-emerald-900/50 text-emerald-400 border-emerald-700/50" },
  COMPLETE: { label: "Complete", icon: CheckCircle2, color: "bg-gray-700", badgeColor: "bg-gray-800/50 text-gray-400 border-gray-700/50" },
  BLOCKED: { label: "Blocked", icon: AlertTriangle, color: "bg-red-800", badgeColor: "bg-red-900/50 text-red-400 border-red-700/50" },
  CANCELLED: { label: "Cancelled", icon: Ban, color: "bg-gray-800", badgeColor: "bg-gray-800/50 text-gray-500 border-gray-700/50" },
};

export function resolveNextAction(commitment) {
  if (!commitment) return { action: null, reason: null };
  
  const status = commitment.commitment_status;
  if (status === 'cancelled') return { action: 'CANCELLED', reason: 'Commitment cancelled' };
  if (status === 'closed') return { action: 'COMPLETE', reason: 'Commitment closed' };

  const rt = commitment.required_total ?? 0;
  const rfs = commitment.reserved_from_stock ?? 0;
  const cfp = commitment.covered_from_po ?? 0;
  const qi = commitment.qty_installed ?? 0;
  const gap = Math.max(0, rt - rfs - cfp);
  const installable = Math.max(0, rfs - qi);

  // Fully installed
  if (qi >= rt && rt > 0) return { action: 'COMPLETE', reason: 'All parts installed' };

  // Has installable stock
  if (installable > 0) return { action: 'INSTALL', reason: `${installable} ready to install`, qty: installable };

  // Has PO coverage but nothing received/reserved yet — wait for receiving
  if (cfp > 0 && rfs === 0) return { action: 'RECEIVE', reason: `${cfp} on order, awaiting delivery`, qty: cfp };

  // Has gap — needs ordering or stock allocation
  if (gap > 0) {
    // Check if part has physical stock that could be allocated
    const inv = commitment.inventory_snapshot || {};
    const availGlobal = inv.available_global_active ?? inv.available ?? 0;
    if (availGlobal > 0) return { action: 'ALLOCATE', reason: `${Math.min(gap, availGlobal)} available in stock`, qty: Math.min(gap, availGlobal) };
    return { action: 'CREATE_PO', reason: `${gap} units need ordering`, qty: gap };
  }

  // Fully covered but not installed
  if (rfs > 0 || cfp > 0) return { action: 'RECEIVE', reason: 'Awaiting delivery' };

  return { action: 'COMPLETE', reason: 'No action needed' };
}

/** Badge-only display */
export function NextActionBadgeInline({ commitment, className }) {
  const { action } = resolveNextAction(commitment);
  if (!action) return null;
  const cfg = NEXT_ACTIONS[action];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn(cfg.badgeColor, "text-[9px] gap-1 font-normal", className)}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </Badge>
  );
}

/** Primary action button */
export default function CommitmentNextAction({ commitment, onAction, isLoading, size = "sm", className }) {
  const { action, reason, qty } = resolveNextAction(commitment);
  if (!action || action === 'COMPLETE' || action === 'CANCELLED') {
    return <NextActionBadgeInline commitment={commitment} className={className} />;
  }

  const cfg = NEXT_ACTIONS[action];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size}
            className={cn(cfg.color, "text-white gap-1.5", className)}
            onClick={(e) => {
              e.stopPropagation();
              onAction?.(commitment, action, qty);
            }}
            disabled={isLoading || action === 'BLOCKED'}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-xs">{cfg.label}</span>
            {qty > 0 && <span className="text-[10px] opacity-75">({qty})</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-gray-800 border-gray-700">
          <p className="text-xs">{reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}