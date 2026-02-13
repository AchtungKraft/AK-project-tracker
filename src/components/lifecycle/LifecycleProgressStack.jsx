import React from "react";
import { cn } from "@/lib/utils";
import { 
  DollarSign, 
  ShoppingCart, 
  Wrench,
  CheckCircle2,
  Circle,
  AlertCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Visual progress stack showing 3 lifecycle axes:
 * - Client (billing/payment)
 * - Procurement (ordering/receiving)
 * - Installation
 */

const AXIS_CONFIG = {
  client: {
    icon: DollarSign,
    label: 'Client',
    states: {
      'NOT_BILLABLE': { progress: 100, color: 'bg-gray-500', label: 'N/A' },
      'NEEDS_BILLING': { progress: 0, color: 'bg-yellow-500', label: 'Needs Billing' },
      'INVOICED': { progress: 50, color: 'bg-orange-500', label: 'Invoiced' },
      'PAID': { progress: 100, color: 'bg-green-500', label: 'Paid' },
    },
    paymentStates: {
      'UNPAID': { color: 'text-red-400' },
      'PARTIAL': { color: 'text-yellow-400' },
      'PAID': { color: 'text-green-400' },
    },
  },
  procurement: {
    icon: ShoppingCart,
    label: 'Order',
    states: {
      'NOT_REQUIRED': { progress: 100, color: 'bg-gray-500', label: 'N/A' },
      'NEEDS_ORDER': { progress: 0, color: 'bg-yellow-500', label: 'Needs Order' },
      'ORDERED': { progress: 33, color: 'bg-blue-500', label: 'Ordered' },
      'PARTIALLY_RECEIVED': { progress: 66, color: 'bg-blue-400', label: 'Partial' },
      'RECEIVED': { progress: 100, color: 'bg-green-500', label: 'Received' },
    },
  },
  installation: {
    icon: Wrench,
    label: 'Install',
    states: {
      'PLANNED': { progress: 0, color: 'bg-gray-500', label: 'Planned' },
      'READY': { progress: 50, color: 'bg-purple-500', label: 'Ready' },
      'INSTALLED': { progress: 100, color: 'bg-green-500', label: 'Installed' },
      'CLOSED': { progress: 100, color: 'bg-green-600', label: 'Closed' },
    },
  },
};

function AxisProgressBar({ axis, status, compact = false }) {
  const config = AXIS_CONFIG[axis];
  if (!config) return null;
  
  const stateConfig = config.states[status] || { progress: 0, color: 'bg-gray-600', label: status };
  const Icon = config.icon;
  
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Icon className={cn("w-3 h-3", stateConfig.progress === 100 ? "text-green-400" : "text-gray-400")} />
              <div className="w-8 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all duration-300", stateConfig.color)}
                  style={{ width: `${stateConfig.progress}%` }}
                />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-gray-800 border-gray-700">
            <p className="text-xs">{config.label}: {stateConfig.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("w-4 h-4", stateConfig.progress === 100 ? "text-green-400" : "text-gray-400")} />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">{config.label}</span>
          <motion.span 
            key={stateConfig.label}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-gray-300"
          >
            {stateConfig.label}
          </motion.span>
        </div>
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <motion.div 
            className={cn("h-full rounded-full", stateConfig.color)}
            initial={{ width: 0 }}
            animate={{ width: `${stateConfig.progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>
    </div>
  );
}

export default function LifecycleProgressStack({ 
  clientBillingStatus, 
  clientPaymentStatus,
  procurementStatus, 
  installStatus,
  nextStepLabel,
  compact = false,
  className 
}) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <AxisProgressBar axis="client" status={clientBillingStatus} compact />
        <AxisProgressBar axis="procurement" status={procurementStatus} compact />
        <AxisProgressBar axis="installation" status={installStatus} compact />
      </div>
    );
  }
  
  return (
    <div className={cn("space-y-3 p-3 bg-gray-800/50 rounded-lg", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Lifecycle Progress</span>
        {clientPaymentStatus && (
          <span className={cn(
            "text-xs font-medium",
            AXIS_CONFIG.client.paymentStates[clientPaymentStatus]?.color || "text-gray-400"
          )}>
            {clientPaymentStatus === 'PAID' ? '✓ Paid' : clientPaymentStatus === 'PARTIAL' ? '◐ Partial' : '○ Unpaid'}
          </span>
        )}
      </div>
      <AxisProgressBar axis="client" status={clientBillingStatus} />
      <AxisProgressBar axis="procurement" status={procurementStatus} />
      <AxisProgressBar axis="installation" status={installStatus} />
      
      {/* Next Step Label - Phase 9.5 */}
      {nextStepLabel && nextStepLabel !== 'Lifecycle Complete' && (
        <div className="pt-2 mt-2 border-t border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase">Next:</span>
            <span className="text-sm font-semibold text-yellow-400">{nextStepLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { AxisProgressBar };