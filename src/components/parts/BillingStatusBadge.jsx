import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DollarSign, FileText, CheckCircle } from "lucide-react";
import { getEffectiveBillingStatus, getBillingStatusColor } from "./partTypeBehavior";

/**
 * BillingStatusBadge
 * Displays billing status for line items or orders
 * 
 * NOTE: This component is LEGACY ONLY. Forward model projects should NOT render this badge.
 * Forward model uses InvoiceBatch status instead of line-item billing_status.
 */
export default function BillingStatusBadge({
  status,
  lineItem,
  order,
  size = "default",
  showIcon = true,
}) {
  // Calculate effective status if lineItem and order provided
  const effectiveStatus = lineItem && order
    ? getEffectiveBillingStatus(lineItem, order)
    : status || "Not Invoiced";

  const colorClass = getBillingStatusColor(effectiveStatus);
  const isOverride = lineItem?.billing_override;

  const icons = {
    "Not Invoiced": DollarSign,
    "Client Invoiced": FileText,
    "Client Paid": CheckCircle,
  };
  const Icon = icons[effectiveStatus] || DollarSign;

  return (
    <Badge
      className={cn(
        colorClass,
        "text-white",
        size === "sm" && "text-xs px-1.5 py-0.5",
        isOverride && "ring-1 ring-amber-500"
      )}
      title={isOverride ? "Line item override" : undefined}
    >
      <div className="flex items-center gap-1">
        {showIcon && <Icon className={cn("w-3 h-3", size === "sm" && "w-2.5 h-2.5")} />}
        <span>{effectiveStatus}</span>
        {isOverride && <span className="text-amber-300">*</span>}
      </div>
    </Badge>
  );
}

/**
 * BillingStatusSelector
 * Dropdown for changing billing status
 */
export function BillingStatusSelector({
  value,
  onChange,
  disabled = false,
  className,
}) {
  const statuses = ["Not Invoiced", "Client Invoiced", "Client Paid"];

  return (
    <select
      value={value || "Not Invoiced"}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "bg-gray-800 border border-gray-700 text-white rounded-md px-2 py-1 text-sm",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}