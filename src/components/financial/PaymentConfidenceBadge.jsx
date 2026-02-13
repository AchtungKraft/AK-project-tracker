import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  RefreshCw, 
  Edit3, 
  RotateCcw, 
  AlertCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * PaymentConfidenceBadge - Shows payment source/confidence level
 * 
 * Types:
 * - qb_verified: Synced from QuickBooks
 * - manual: Manual entry
 * - partial: Partial payment
 * - reversed: Payment was reversed
 * - pending: Payment pending
 */

const CONFIDENCE_CONFIG = {
  qb_verified: {
    icon: CheckCircle2,
    label: 'QB Verified',
    color: 'bg-green-600/20 text-green-400 border-green-600/30',
    description: 'Payment verified via QuickBooks sync',
  },
  synced: {
    icon: RefreshCw,
    label: 'QB Synced',
    color: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    description: 'Payment synced with QuickBooks',
  },
  manual: {
    icon: Edit3,
    label: 'Manual',
    color: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
    description: 'Payment entered manually',
  },
  partial: {
    icon: AlertCircle,
    label: 'Partial',
    color: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    description: 'Partial payment received',
  },
  reversed: {
    icon: RotateCcw,
    label: 'Reversed',
    color: 'bg-red-600/20 text-red-400 border-red-600/30',
    description: 'Payment was reversed',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    color: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
    description: 'Payment pending sync',
  },
  failed: {
    icon: AlertCircle,
    label: 'Sync Failed',
    color: 'bg-red-600/20 text-red-400 border-red-600/30',
    description: 'Payment sync failed',
  },
};

export default function PaymentConfidenceBadge({ 
  status, 
  showTooltip = true,
  compact = false,
  className,
}) {
  const config = CONFIDENCE_CONFIG[status] || CONFIDENCE_CONFIG.pending;
  const Icon = config.icon;

  const badge = (
    <Badge className={cn("gap-1 border", config.color, className)}>
      <Icon className={cn("w-3 h-3", compact && "w-2.5 h-2.5")} />
      {!compact && config.label}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-gray-800 border-gray-700">
          <p className="text-xs">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper to derive confidence from batch/commitment data
export function derivePaymentConfidence(data) {
  if (!data) return 'pending';
  
  // Check for reversal
  if (data.voided_at || data.status === 'voided') {
    return 'reversed';
  }
  
  // Check payment sync status
  if (data.payment_sync_status) {
    if (data.payment_sync_status === 'synced') return 'synced';
    if (data.payment_sync_status === 'manual') return 'manual';
    if (data.payment_sync_status === 'failed') return 'failed';
    if (data.payment_sync_status === 'pending') return 'pending';
  }
  
  // Check if paid
  if (data.status === 'paid' || data.billing_status === 'paid') {
    return 'manual'; // Default to manual if no sync status
  }
  
  return 'pending';
}