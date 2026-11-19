import { Receipt, Clock, FileText, CheckCircle2, HelpCircle, AlertCircle, ShieldCheck } from "lucide-react";

export const CLIENT_BILLING_COLORS = {
  NOT_BILLABLE: { bg: "bg-gray-600", label: "Not Billable" },
  NOT_INVOICED: { bg: "bg-yellow-600", label: "Not Invoiced" },
  INVOICED: { bg: "bg-blue-600", label: "Invoiced" },
  PARTIALLY_PAID: { bg: "bg-orange-600", label: "Partially Paid" },
  PAID: { bg: "bg-green-600", label: "Paid" },
};

export const CLIENT_PAYMENT_COLORS = {
  NOT_APPLICABLE: { bg: "bg-gray-600", label: "N/A" },
  PENDING: { bg: "bg-yellow-600", label: "Pending" },
  PARTIAL: { bg: "bg-orange-600", label: "Partial" },
  PAID: { bg: "bg-green-600", label: "Paid" },
};

export const VENDOR_INVOICE_COLORS = {
  NOT_RECEIVED: { bg: "bg-gray-600", label: "Not Received" },
  RECEIVED: { bg: "bg-yellow-600", label: "Received" },
  APPROVED: { bg: "bg-blue-600", label: "Approved" },
  POSTED: { bg: "bg-purple-600", label: "Posted" },
  PAID: { bg: "bg-green-600", label: "Paid" },
};

export const VENDOR_PAYMENT_COLORS = {
  NOT_APPLICABLE: { bg: "bg-gray-600", label: "N/A" },
  UNPAID: { bg: "bg-red-600", label: "Unpaid" },
  PARTIAL: { bg: "bg-orange-600", label: "Partial" },
  PAID: { bg: "bg-green-600", label: "Paid" },
};

export const MARGIN_STATE_COLORS = {
  UNKNOWN: { bg: "bg-gray-600", label: "Unknown", icon: HelpCircle },
  COST_ONLY: { bg: "bg-orange-600", label: "Cost Only", icon: Receipt },
  BILLABLE_PENDING: { bg: "bg-yellow-600", label: "Billable Pending", icon: Clock },
  INVOICED_PENDING_PAYMENT: { bg: "bg-blue-600", label: "Invoiced - Pending Payment", icon: FileText },
  COMPLETE: { bg: "bg-green-600", label: "Complete", icon: CheckCircle2 },
};

export const FINANCIAL_ROLE_LABELS = {
  VENDOR_MARGIN: { label: "Vendor Margin", color: "bg-purple-600" },
  INTERNAL_MANUFACTURING: { label: "Internal Mfg", color: "bg-blue-600" },
  LABOR_ONLY: { label: "Labor Only", color: "bg-teal-600" },
  ASSET_RECOVERY: { label: "Asset Recovery", color: "bg-amber-600" },
  NON_BILLABLE: { label: "Non-Billable", color: "bg-gray-600" },
};

export const BILLING_SOURCE_LABELS = {
  LINE_OVERRIDE: "Line Item Override",
  ORDER: "Order",
  COMMITMENT: "Commitment",
  NONE: "None",
};

export const ORDERING_SAFETY_CONFIG = {
  RED: { label: "Not Billed", color: "bg-red-600", icon: AlertCircle },
  YELLOW: { label: "Awaiting Payment", color: "bg-yellow-600", icon: Clock },
  GREEN: { label: "Paid - Safe to Order", color: "bg-green-600", icon: ShieldCheck },
};

export const LIFECYCLE_LABELS = {
  ASSIGNED_NEEDS_BILLING: "Needs Billing",
  BILLED_NOT_PAID: "Awaiting Payment",
  PAID_READY_TO_ORDER: "Ready to Order",
  ORDERED_WAITING_RECEIPT: "Order in Progress",
  INSTALLED_READY_TO_BILL: "Installed - Billing",
};

export const pick = (map, key, fallbackKey) => map[key] || map[fallbackKey];