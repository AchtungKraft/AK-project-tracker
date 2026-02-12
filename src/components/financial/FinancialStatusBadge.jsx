import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DollarSign,
  Receipt,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Truck,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// COLOR CONFIGURATIONS
// ============================================

const CLIENT_BILLING_COLORS = {
  NOT_BILLABLE: { bg: "bg-gray-600", text: "text-gray-100", label: "Not Billable" },
  NOT_INVOICED: { bg: "bg-yellow-600", text: "text-yellow-100", label: "Not Invoiced" },
  INVOICED: { bg: "bg-blue-600", text: "text-blue-100", label: "Invoiced" },
  PARTIALLY_PAID: { bg: "bg-orange-600", text: "text-orange-100", label: "Partially Paid" },
  PAID: { bg: "bg-green-600", text: "text-green-100", label: "Paid" },
};

const VENDOR_STATUS_COLORS = {
  NOT_RECEIVED: { bg: "bg-gray-600", text: "text-gray-100", label: "Not Received" },
  RECEIVED: { bg: "bg-yellow-600", text: "text-yellow-100", label: "Received" },
  APPROVED: { bg: "bg-blue-600", text: "text-blue-100", label: "Approved" },
  POSTED: { bg: "bg-purple-600", text: "text-purple-100", label: "Posted" },
  PAID: { bg: "bg-green-600", text: "text-green-100", label: "Paid" },
};

const MARGIN_STATE_COLORS = {
  UNKNOWN: { bg: "bg-gray-600", text: "text-gray-100", label: "Unknown", icon: HelpCircle },
  COST_ONLY: { bg: "bg-orange-600", text: "text-orange-100", label: "Cost Only", icon: Receipt },
  BILLABLE_PENDING: { bg: "bg-yellow-600", text: "text-yellow-100", label: "Billable Pending", icon: Clock },
  INVOICED_PENDING_PAYMENT: { bg: "bg-blue-600", text: "text-blue-100", label: "Invoiced", icon: FileText },
  COMPLETE: { bg: "bg-green-600", text: "text-green-100", label: "Complete", icon: CheckCircle2 },
};

const FINANCIAL_ROLE_LABELS = {
  VENDOR_MARGIN: "Vendor Margin",
  INTERNAL_MANUFACTURING: "Internal Mfg",
  LABOR_ONLY: "Labor Only",
  ASSET_RECOVERY: "Asset Recovery",
  NON_BILLABLE: "Non-Billable",
};

const BILLING_SOURCE_LABELS = {
  LINE_OVERRIDE: "Line Item Override",
  ORDER: "Order",
  COMMITMENT: "Commitment",
  NONE: "None",
};

// ============================================
// SUB-COMPONENTS
// ============================================

function ClientBillingBadge({ status, compact }) {
  const config = CLIENT_BILLING_COLORS[status] || CLIENT_BILLING_COLORS.NOT_INVOICED;
  
  return (
    <Badge className={cn(config.bg, "text-white text-xs", compact && "px-1.5 py-0")}>
      {compact ? (
        <DollarSign className="w-3 h-3" />
      ) : (
        <>
          <DollarSign className="w-3 h-3 mr-1" />
          {config.label}
        </>
      )}
    </Badge>
  );
}

function VendorStatusBadge({ status, financialRole, compact }) {
  // N/A for labor-only or non-billable parts
  if (financialRole === "LABOR_ONLY" || financialRole === "NON_BILLABLE") {
    return (
      <Badge className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0">
        {compact ? <Truck className="w-3 h-3 opacity-50" /> : "N/A"}
      </Badge>
    );
  }
  
  const config = VENDOR_STATUS_COLORS[status] || VENDOR_STATUS_COLORS.NOT_RECEIVED;
  
  return (
    <Badge className={cn(config.bg, "text-white text-xs", compact && "px-1.5 py-0")}>
      {compact ? (
        <Truck className="w-3 h-3" />
      ) : (
        <>
          <Truck className="w-3 h-3 mr-1" />
          {config.label}
        </>
      )}
    </Badge>
  );
}

function MarginStateBadge({ state, compact }) {
  const config = MARGIN_STATE_COLORS[state] || MARGIN_STATE_COLORS.UNKNOWN;
  const Icon = config.icon;
  
  return (
    <Badge className={cn(config.bg, "text-white text-xs", compact && "px-1.5 py-0")}>
      {compact ? (
        <Icon className="w-3 h-3" />
      ) : (
        <>
          <Icon className="w-3 h-3 mr-1" />
          {config.label}
        </>
      )}
    </Badge>
  );
}

// ============================================
// TOOLTIP DRILLDOWN
// ============================================

function FinancialDrilldown({ status }) {
  if (!status) return null;
  
  const clientConfig = CLIENT_BILLING_COLORS[status.client_billing_status];
  const vendorConfig = VENDOR_STATUS_COLORS[status.vendor_invoice_status];
  const marginConfig = MARGIN_STATE_COLORS[status.margin_state];
  
  return (
    <div className="space-y-3 p-1 min-w-[220px]">
      {/* Client Billing */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Client Billing</div>
        <div className="flex items-center justify-between">
          <span className="text-white text-sm">{clientConfig?.label || status.client_billing_status}</span>
          <Badge className={cn(clientConfig?.bg || "bg-gray-600", "text-white text-xs")}>
            {status.client_payment_status}
          </Badge>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Source: {BILLING_SOURCE_LABELS[status.billing_source] || status.billing_source}
          {status.billing_source === "LINE_OVERRIDE" && (
            <span className="ml-1 text-yellow-500">⚡ Override</span>
          )}
        </div>
      </div>
      
      {/* Vendor Cost */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Vendor Cost</div>
        <div className="flex items-center justify-between">
          <span className="text-white text-sm">{vendorConfig?.label || status.vendor_invoice_status}</span>
          <Badge className={cn(
            status.vendor_payment_status === "PAID" ? "bg-green-600" : "bg-gray-600",
            "text-white text-xs"
          )}>
            {status.vendor_payment_status}
          </Badge>
        </div>
        {status.vendor_source !== "NONE" && (
          <div className="text-xs text-gray-500 mt-1">
            Source: {status.vendor_source}
          </div>
        )}
      </div>
      
      {/* Margin State */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Margin Completion</div>
        <div className="flex items-center gap-2">
          <MarginStateBadge state={status.margin_state} compact={false} />
        </div>
      </div>
      
      {/* Financial Role */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Financial Role</div>
        <span className="text-white text-sm">
          {FINANCIAL_ROLE_LABELS[status.financial_role] || status.financial_role}
        </span>
      </div>
      
      {/* Commitment Status */}
      {status.commitment_status && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Commitment</div>
          <Badge variant="outline" className="text-xs">
            {status.commitment_status}
          </Badge>
        </div>
      )}
      
      {/* Timestamps */}
      <div className="border-t border-gray-700 pt-2 mt-2">
        <div className="text-xs text-gray-500">
          Updated: {new Date(status.last_updated_at).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function FinancialStatusBadge({ 
  financialStatus, 
  displayMode = "compact",
  showTooltip = true,
}) {
  if (!financialStatus) {
    return (
      <Badge className="bg-gray-700 text-gray-400 text-xs">
        <AlertCircle className="w-3 h-3 mr-1" />
        {displayMode === "compact" ? "?" : "Financial Data Incomplete"}
      </Badge>
    );
  }
  
  const compact = displayMode === "compact";
  
  const content = (
    <div className={cn("flex items-center", compact ? "gap-1" : "gap-2 flex-wrap")}>
      <ClientBillingBadge 
        status={financialStatus.client_billing_status} 
        compact={compact} 
      />
      <VendorStatusBadge 
        status={financialStatus.vendor_invoice_status}
        financialRole={financialStatus.financial_role}
        compact={compact} 
      />
      <MarginStateBadge 
        state={financialStatus.margin_state} 
        compact={compact} 
      />
    </div>
  );
  
  if (!showTooltip) {
    return content;
  }
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="cursor-pointer">{content}</div>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="bg-gray-900 border-gray-700 p-3"
        >
          <FinancialDrilldown status={financialStatus} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Export sub-components for individual use
export { ClientBillingBadge, VendorStatusBadge, MarginStateBadge, FinancialDrilldown };