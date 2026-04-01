import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  AlertTriangle,
  Clock,
  DollarSign,
  ShoppingCart,
  Truck,
  Wrench,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Universal lifecycle badge displaying:
 * - Overall stage
 * - Ordering safety
 * - Invoice readiness
 */

const STAGE_CONFIG = {
  BLOCKED: {
    icon: XCircle,
    label: 'Blocked',
    color: 'bg-red-600',
    textColor: 'text-red-400',
  },
  AWAITING_CLIENT_PAYMENT: {
    icon: Clock,
    label: 'Awaiting Payment',
    color: 'bg-orange-600',
    textColor: 'text-orange-400',
  },
  READY_FOR_ORDER: {
    icon: ShoppingCart,
    label: 'Ready to Order',
    color: 'bg-green-600',
    textColor: 'text-green-400',
  },
  ORDER_IN_PROGRESS: {
    icon: Truck,
    label: 'Order In Progress',
    color: 'bg-blue-600',
    textColor: 'text-blue-400',
  },
  INSTALL_READY: {
    icon: Wrench,
    label: 'Ready to Install',
    color: 'bg-emerald-600',
    textColor: 'text-emerald-400',
  },
  AWAITING_INSTALL: {
    icon: Wrench,
    label: 'Ready to Install',
    color: 'bg-purple-600',
    textColor: 'text-purple-400',
  },
  COMPLETE: {
    icon: CheckCircle2,
    label: 'Complete',
    color: 'bg-green-700',
    textColor: 'text-green-400',
  },
};

const SAFETY_CONFIG = {
  RED: { color: 'bg-red-600', label: 'Not Billed' },
  YELLOW: { color: 'bg-yellow-600', label: 'Awaiting Pay' },
  GREEN: { color: 'bg-green-600', label: 'Paid' },
};

const READINESS_CONFIG = {
  READY: { color: 'text-green-400', label: 'Ready' },
  PARTIAL: { color: 'text-yellow-400', label: 'Partial' },
  BLOCKED: { color: 'text-red-400', label: 'Blocked' },
};

export default function UniversalLifecycleBadge({
  overallStage,
  orderingSafety,
  invoiceReadiness,
  nextStepLabel,
  showSafety = true,
  showReadiness = false,
  showNextStep = false,
  compact = false,
  className,
}) {
  const stageConfig = STAGE_CONFIG[overallStage] || STAGE_CONFIG.BLOCKED;
  const Icon = stageConfig.icon;
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-1", className)}>
              <Badge className={cn("text-xs px-1.5 py-0.5", stageConfig.color)}>
                <Icon className="w-3 h-3" />
              </Badge>
              {showSafety && orderingSafety && (
                <Badge className={cn("text-xs px-1.5 py-0.5", SAFETY_CONFIG[orderingSafety]?.color)}>
                  {orderingSafety}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-gray-800 border-gray-700">
            <div className="text-xs space-y-1">
              <p>Stage: {stageConfig.label}</p>
              {showSafety && orderingSafety && (
                <p>Safety: {SAFETY_CONFIG[orderingSafety]?.label}</p>
              )}
              {showReadiness && invoiceReadiness && (
                <p>Invoice: {READINESS_CONFIG[invoiceReadiness]?.label}</p>
              )}
              {nextStepLabel && nextStepLabel !== 'Lifecycle Complete' && (
                <p className="font-semibold text-yellow-400">Next: {nextStepLabel}</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge className={cn("gap-1", stageConfig.color)}>
        <Icon className="w-3.5 h-3.5" />
        {stageConfig.label}
      </Badge>
      
      {showSafety && orderingSafety && (
        <Badge className={cn("text-xs", SAFETY_CONFIG[orderingSafety]?.color)}>
          {orderingSafety === 'GREEN' ? '✓' : orderingSafety === 'YELLOW' ? '◐' : '○'} {SAFETY_CONFIG[orderingSafety]?.label}
        </Badge>
      )}
      
      {showReadiness && invoiceReadiness && invoiceReadiness !== 'READY' && (
        <Badge variant="outline" className={cn("text-xs", READINESS_CONFIG[invoiceReadiness]?.color)}>
          Invoice: {READINESS_CONFIG[invoiceReadiness]?.label}
        </Badge>
      )}
      
      {/* Next Step Label - Phase 9.5 */}
      {showNextStep && nextStepLabel && nextStepLabel !== 'Lifecycle Complete' && (
        <Badge className="bg-yellow-600/30 text-yellow-400 text-xs">
          → {nextStepLabel}
        </Badge>
      )}
    </div>
  );
}

export function OrderingSafetyBadge({ safety, size = "default" }) {
  const config = SAFETY_CONFIG[safety];
  if (!config) return null;
  
  return (
    <Badge className={cn(
      config.color,
      size === "sm" ? "text-xs px-1.5 py-0.5" : "text-xs"
    )}>
      {safety}
    </Badge>
  );
}

export function InvoiceReadinessBadge({ readiness }) {
  const config = READINESS_CONFIG[readiness];
  if (!config) return null;
  
  return (
    <span className={cn("text-xs font-medium", config.color)}>
      {config.label}
    </span>
  );
}