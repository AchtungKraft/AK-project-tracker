import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Filter, DollarSign, Truck, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// FILTER OPTIONS
// ============================================

const BILLING_STATUS_OPTIONS = [
  { value: "all", label: "All Billing Status" },
  { value: "NOT_BILLABLE", label: "Not Billable" },
  { value: "NOT_INVOICED", label: "Not Invoiced" },
  { value: "INVOICED", label: "Invoiced" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
];

const VENDOR_PAYMENT_OPTIONS = [
  { value: "all", label: "All Vendor Status" },
  { value: "UNPAID", label: "Vendor Unpaid" },
  { value: "PAID", label: "Vendor Paid" },
];

const MARGIN_STATE_OPTIONS = [
  { value: "all", label: "All Margin States" },
  { value: "UNKNOWN", label: "Unknown" },
  { value: "COST_ONLY", label: "Cost Only" },
  { value: "BILLABLE_PENDING", label: "Billable Pending" },
  { value: "INVOICED_PENDING_PAYMENT", label: "Invoiced Pending" },
  { value: "COMPLETE", label: "Complete" },
];

const FINANCIAL_ROLE_OPTIONS = [
  { value: "all", label: "All Financial Roles" },
  { value: "VENDOR_MARGIN", label: "Vendor Margin" },
  { value: "INTERNAL_MANUFACTURING", label: "Internal Mfg" },
  { value: "LABOR_ONLY", label: "Labor Only" },
  { value: "ASSET_RECOVERY", label: "Asset Recovery" },
  { value: "NON_BILLABLE", label: "Non-Billable" },
];

// Quick filter presets
const QUICK_FILTERS = [
  { 
    id: "unbilled", 
    label: "Unbilled Parts", 
    icon: DollarSign,
    filter: { billingStatus: "NOT_INVOICED" } 
  },
  { 
    id: "vendor_unpaid", 
    label: "Vendor Unpaid", 
    icon: Truck,
    filter: { vendorPayment: "UNPAID" } 
  },
  { 
    id: "margin_incomplete", 
    label: "Margin Incomplete", 
    icon: TrendingUp,
    filter: { marginState: "BILLABLE_PENDING" } 
  },
];

// ============================================
// INDIVIDUAL FILTER COMPONENTS
// ============================================

export function BillingStatusFilter({ value, onChange, className }) {
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className={cn("w-40 bg-gray-900 border-gray-600", className)}>
        <DollarSign className="w-4 h-4 mr-2 text-gray-400" />
        <SelectValue placeholder="Billing Status" />
      </SelectTrigger>
      <SelectContent>
        {BILLING_STATUS_OPTIONS.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function VendorPaymentFilter({ value, onChange, className }) {
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className={cn("w-40 bg-gray-900 border-gray-600", className)}>
        <Truck className="w-4 h-4 mr-2 text-gray-400" />
        <SelectValue placeholder="Vendor Payment" />
      </SelectTrigger>
      <SelectContent>
        {VENDOR_PAYMENT_OPTIONS.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MarginStateFilter({ value, onChange, className }) {
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className={cn("w-44 bg-gray-900 border-gray-600", className)}>
        <TrendingUp className="w-4 h-4 mr-2 text-gray-400" />
        <SelectValue placeholder="Margin State" />
      </SelectTrigger>
      <SelectContent>
        {MARGIN_STATE_OPTIONS.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FinancialRoleFilter({ value, onChange, className }) {
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className={cn("w-40 bg-gray-900 border-gray-600", className)}>
        <Filter className="w-4 h-4 mr-2 text-gray-400" />
        <SelectValue placeholder="Financial Role" />
      </SelectTrigger>
      <SelectContent>
        {FINANCIAL_ROLE_OPTIONS.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================
// COMBINED FILTER TOOLBAR
// ============================================

export default function FinancialStatusFilters({
  filters = {},
  onFilterChange,
  showQuickFilters = true,
  compact = false,
}) {
  const { billingStatus, vendorPayment, marginState, financialRole } = filters;
  
  const handleChange = (key, value) => {
    onFilterChange({
      ...filters,
      [key]: value === "all" ? null : value,
    });
  };
  
  const clearAllFilters = () => {
    onFilterChange({
      billingStatus: null,
      vendorPayment: null,
      marginState: null,
      financialRole: null,
    });
  };
  
  const applyQuickFilter = (quickFilter) => {
    onFilterChange({
      billingStatus: null,
      vendorPayment: null,
      marginState: null,
      financialRole: null,
      ...quickFilter.filter,
    });
  };
  
  const hasActiveFilters = billingStatus || vendorPayment || marginState || financialRole;
  
  return (
    <div className="space-y-3">
      {/* Quick Filters */}
      {showQuickFilters && (
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map(qf => {
            const Icon = qf.icon;
            const isActive = Object.entries(qf.filter).every(
              ([key, val]) => filters[key] === val
            );
            
            return (
              <Button
                key={qf.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => applyQuickFilter(qf)}
                className={cn(
                  "text-xs",
                  isActive && "bg-red-600 hover:bg-red-700"
                )}
              >
                <Icon className="w-3 h-3 mr-1" />
                {qf.label}
              </Button>
            );
          })}
        </div>
      )}
      
      {/* Filter Dropdowns */}
      <div className={cn("flex flex-wrap gap-2", compact && "gap-1")}>
        <BillingStatusFilter
          value={billingStatus || "all"}
          onChange={(v) => handleChange("billingStatus", v)}
          className={compact ? "w-32" : ""}
        />
        <VendorPaymentFilter
          value={vendorPayment || "all"}
          onChange={(v) => handleChange("vendorPayment", v)}
          className={compact ? "w-32" : ""}
        />
        <MarginStateFilter
          value={marginState || "all"}
          onChange={(v) => handleChange("marginState", v)}
          className={compact ? "w-36" : ""}
        />
        <FinancialRoleFilter
          value={financialRole || "all"}
          onChange={(v) => handleChange("financialRole", v)}
          className={compact ? "w-32" : ""}
        />
        
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
      
      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1">
          {billingStatus && (
            <Badge variant="outline" className="text-xs">
              Billing: {billingStatus}
              <button onClick={() => handleChange("billingStatus", "all")} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {vendorPayment && (
            <Badge variant="outline" className="text-xs">
              Vendor: {vendorPayment}
              <button onClick={() => handleChange("vendorPayment", "all")} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {marginState && (
            <Badge variant="outline" className="text-xs">
              Margin: {marginState}
              <button onClick={() => handleChange("marginState", "all")} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {financialRole && (
            <Badge variant="outline" className="text-xs">
              Role: {financialRole}
              <button onClick={() => handleChange("financialRole", "all")} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// FILTER UTILITY FUNCTION
// ============================================

/**
 * Apply financial filters to resolved status array
 * @param {Array} items - Items with financialStatus property
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered items
 */
export function applyFinancialFilters(items, filters) {
  if (!filters) return items;
  
  const { billingStatus, vendorPayment, marginState, financialRole } = filters;
  
  return items.filter(item => {
    const status = item.financialStatus;
    if (!status) return true; // Keep items without status data
    
    if (billingStatus && status.client_billing_status !== billingStatus) return false;
    if (vendorPayment && status.vendor_payment_status !== vendorPayment) return false;
    if (marginState && status.margin_state !== marginState) return false;
    if (financialRole && status.financial_role !== financialRole) return false;
    
    return true;
  });
}