import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, 
  Package, 
  Wrench, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2,
  User,
  Calculator
} from "lucide-react";

/**
 * NextActionBadge - Display recommended next action for a commitment
 * 
 * Actions: CREATE_PO, RECEIVE, INSTALL, ALLOCATE_POOL, FIX_VENDOR, FIX_QTY, FIX_INVARIANT, COMPLETE
 */

const ACTION_CONFIG = {
  CREATE_PO: {
    label: 'Create PO',
    shortLabel: 'Order',
    icon: ShoppingCart,
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    priority: 1,
  },
  RECEIVE: {
    label: 'Receive',
    shortLabel: 'Receive',
    icon: Package,
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
    priority: 2,
  },
  INSTALL: {
    label: 'Install',
    shortLabel: 'Install',
    icon: Wrench,
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    priority: 3,
  },
  ALLOCATE_POOL: {
    label: 'Fund',
    shortLabel: 'Fund',
    icon: DollarSign,
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    priority: 0, // Highest priority - blocks other actions
  },
  FIX_VENDOR: {
    label: 'Assign Vendor',
    shortLabel: 'Vendor',
    icon: User,
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    priority: 0,
  },
  FIX_QTY: {
    label: 'Fix Quantity',
    shortLabel: 'Fix Qty',
    icon: Calculator,
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    priority: 0,
  },
  FIX_INVARIANT: {
    label: 'Fix Data',
    shortLabel: 'Fix',
    icon: AlertTriangle,
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    priority: 0,
  },
  COMPLETE: {
    label: 'Complete',
    shortLabel: 'Done',
    icon: CheckCircle2,
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    priority: 99,
  },
};

export default function NextActionBadge({ 
  nextAction, 
  blockReason, 
  compact = false, 
  showBlockReason = true,
  className 
}) {
  if (!nextAction) {
    return null;
  }

  const config = ACTION_CONFIG[nextAction] || ACTION_CONFIG.FIX_INVARIANT;
  const Icon = config.icon;
  const isBlocked = !!blockReason;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Badge 
        variant="outline" 
        className={cn(
          "font-normal gap-1",
          config.className,
          isBlocked && "border-dashed"
        )}
      >
        <Icon className="w-3 h-3" />
        {compact ? config.shortLabel : config.label}
      </Badge>
      {isBlocked && showBlockReason && (
        <span className="text-xs text-red-400">
          ({BLOCK_MESSAGES[blockReason] || 'Blocked'})
        </span>
      )}
    </div>
  );
}

/**
 * NextActionIcon - Just the icon
 */
export function NextActionIcon({ nextAction, className }) {
  if (!nextAction) return null;
  const config = ACTION_CONFIG[nextAction] || ACTION_CONFIG.FIX_INVARIANT;
  const Icon = config.icon;
  return <Icon className={cn("w-4 h-4", className)} />;
}

/**
 * getNextActionInfo - Get config for an action
 */
export function getNextActionInfo(nextAction) {
  return ACTION_CONFIG[nextAction] || null;
}

const BLOCK_MESSAGES = {
  NO_VENDOR: 'No vendor',
  INSUFFICIENT_FUNDS: 'Need funds',
  PREPAY_REQUIRED: 'Prepay needed',
  NEGATIVE_AVAILABLE: 'Over-committed',
  INVARIANT_VIOLATION: 'Data error',
  ARCHIVED_PART: 'Part archived',
};