import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign,
  Receipt,
  Truck,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  ExternalLink,
  Package,
  Link2,
  Calendar,
  TrendingUp,
  HelpCircle,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PartTypeBadge } from "../parts/PartTypeSelector";

// ============================================
// STATUS COLOR CONFIGS
// ============================================

const CLIENT_BILLING_COLORS = {
  NOT_BILLABLE: { bg: "bg-gray-600", text: "text-gray-100", label: "Not Billable" },
  NOT_INVOICED: { bg: "bg-yellow-600", text: "text-yellow-100", label: "Not Invoiced" },
  INVOICED: { bg: "bg-blue-600", text: "text-blue-100", label: "Invoiced" },
  PARTIALLY_PAID: { bg: "bg-orange-600", text: "text-orange-100", label: "Partially Paid" },
  PAID: { bg: "bg-green-600", text: "text-green-100", label: "Paid" },
};

const CLIENT_PAYMENT_COLORS = {
  NOT_APPLICABLE: { bg: "bg-gray-600", label: "N/A" },
  PENDING: { bg: "bg-yellow-600", label: "Pending" },
  PARTIAL: { bg: "bg-orange-600", label: "Partial" },
  PAID: { bg: "bg-green-600", label: "Paid" },
};

const VENDOR_INVOICE_COLORS = {
  NOT_RECEIVED: { bg: "bg-gray-600", label: "Not Received" },
  RECEIVED: { bg: "bg-yellow-600", label: "Received" },
  APPROVED: { bg: "bg-blue-600", label: "Approved" },
  POSTED: { bg: "bg-purple-600", label: "Posted" },
  PAID: { bg: "bg-green-600", label: "Paid" },
};

const VENDOR_PAYMENT_COLORS = {
  NOT_APPLICABLE: { bg: "bg-gray-600", label: "N/A" },
  UNPAID: { bg: "bg-red-600", label: "Unpaid" },
  PARTIAL: { bg: "bg-orange-600", label: "Partial" },
  PAID: { bg: "bg-green-600", label: "Paid" },
};

const MARGIN_STATE_COLORS = {
  UNKNOWN: { bg: "bg-gray-600", label: "Unknown", icon: HelpCircle },
  COST_ONLY: { bg: "bg-orange-600", label: "Cost Only", icon: Receipt },
  BILLABLE_PENDING: { bg: "bg-yellow-600", label: "Billable Pending", icon: Clock },
  INVOICED_PENDING_PAYMENT: { bg: "bg-blue-600", label: "Invoiced - Pending Payment", icon: FileText },
  COMPLETE: { bg: "bg-green-600", label: "Complete", icon: CheckCircle2 },
};

const FINANCIAL_ROLE_LABELS = {
  VENDOR_MARGIN: { label: "Vendor Margin", color: "bg-purple-600" },
  INTERNAL_MANUFACTURING: { label: "Internal Mfg", color: "bg-blue-600" },
  LABOR_ONLY: { label: "Labor Only", color: "bg-teal-600" },
  ASSET_RECOVERY: { label: "Asset Recovery", color: "bg-amber-600" },
  NON_BILLABLE: { label: "Non-Billable", color: "bg-gray-600" },
};

const BILLING_SOURCE_LABELS = {
  LINE_OVERRIDE: "Line Item Override",
  ORDER: "Order",
  COMMITMENT: "Commitment",
  NONE: "None",
};

const ORDERING_SAFETY_CONFIG = {
  RED: { label: 'Not Billed', color: 'bg-red-600', icon: AlertCircle },
  YELLOW: { label: 'Awaiting Payment', color: 'bg-yellow-600', icon: Clock },
  GREEN: { label: 'Paid - Safe to Order', color: 'bg-green-600', icon: ShieldCheck },
};

const LIFECYCLE_LABELS = {
  ASSIGNED_NEEDS_BILLING: 'Needs Billing',
  BILLED_NOT_PAID: 'Awaiting Payment',
  PAID_READY_TO_ORDER: 'Ready to Order',
  ORDERED_WAITING_RECEIPT: 'Order in Progress',
  INSTALLED_READY_TO_BILL: 'Installed - Billing',
};

// ============================================
// TIMELINE ITEM COMPONENT
// ============================================

function TimelineItem({ icon: Icon, label, date, status, isLast }) {
  const hasDate = !!date;
  
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          hasDate ? "bg-green-600/20" : "bg-gray-700/50"
        )}>
          <Icon className={cn("w-4 h-4", hasDate ? "text-green-400" : "text-gray-500")} />
        </div>
        {!isLast && <div className="w-0.5 h-8 bg-gray-700 mt-1" />}
      </div>
      <div className="flex-1 pt-1">
        <p className={cn("text-sm", hasDate ? "text-white" : "text-gray-500")}>{label}</p>
        {hasDate ? (
          <p className="text-xs text-gray-400">{new Date(date).toLocaleDateString()}</p>
        ) : (
          <p className="text-xs text-gray-600">Pending</p>
        )}
      </div>
      {status && (
        <Badge className={cn("text-xs", status.bg)}>{status.label}</Badge>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function FinancialDetailDrawer({ 
  isOpen, 
  onClose, 
  partId, 
  projectId,
  financialStatus,
  lifecycleContext, // Optional: { lifecycle_category, ordering_safety, commitment_id, order_reference }
}) {
  // Fetch part data
  const { data: part } = useQuery({
    queryKey: ['part', partId],
    queryFn: async () => {
      const parts = await base44.entities.Part.filter({ id: partId });
      return parts[0] || null;
    },
    enabled: isOpen && !!partId,
  });

  // Fetch order if we have order reference
  const { data: order } = useQuery({
    queryKey: ['order', financialStatus?.order_id],
    queryFn: async () => {
      const orders = await base44.entities.Order.filter({ id: financialStatus.order_id });
      return orders[0] || null;
    },
    enabled: isOpen && !!financialStatus?.order_id,
  });

  // Fetch vendor invoice if we have reference
  const { data: vendorInvoice } = useQuery({
    queryKey: ['vendorInvoice', financialStatus?.vendor_invoice_id],
    queryFn: async () => {
      const invoices = await base44.entities.VendorInvoice.filter({ id: financialStatus.vendor_invoice_id });
      return invoices[0] || null;
    },
    enabled: isOpen && !!financialStatus?.vendor_invoice_id,
  });

  // Fetch vendor
  const { data: vendor } = useQuery({
    queryKey: ['vendor', vendorInvoice?.vendor_id || part?.default_vendor_id],
    queryFn: async () => {
      const vendorId = vendorInvoice?.vendor_id || part?.default_vendor_id;
      const vendors = await base44.entities.Vendor.filter({ id: vendorId });
      return vendors[0] || null;
    },
    enabled: isOpen && !!(vendorInvoice?.vendor_id || part?.default_vendor_id),
  });

  // Fetch commitment if we have reference
  const { data: commitment } = useQuery({
    queryKey: ['commitment', financialStatus?.commitment_id],
    queryFn: async () => {
      const commitments = await base44.entities.PartCommitment.filter({ id: financialStatus.commitment_id });
      return commitments[0] || null;
    },
    enabled: isOpen && !!financialStatus?.commitment_id,
  });

  const clientBillingConfig = CLIENT_BILLING_COLORS[financialStatus?.client_billing_status] || CLIENT_BILLING_COLORS.NOT_INVOICED;
  const clientPaymentConfig = CLIENT_PAYMENT_COLORS[financialStatus?.client_payment_status] || CLIENT_PAYMENT_COLORS.PENDING;
  const vendorInvoiceConfig = VENDOR_INVOICE_COLORS[financialStatus?.vendor_invoice_status] || VENDOR_INVOICE_COLORS.NOT_RECEIVED;
  const vendorPaymentConfig = VENDOR_PAYMENT_COLORS[financialStatus?.vendor_payment_status] || VENDOR_PAYMENT_COLORS.UNPAID;
  const marginConfig = MARGIN_STATE_COLORS[financialStatus?.margin_state] || MARGIN_STATE_COLORS.UNKNOWN;
  const roleConfig = FINANCIAL_ROLE_LABELS[financialStatus?.financial_role] || FINANCIAL_ROLE_LABELS.VENDOR_MARGIN;
  const MarginIcon = marginConfig.icon;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg bg-gray-900 border-gray-700 p-0 overflow-hidden"
      >
        <SheetHeader className="p-4 border-b border-gray-700">
          <SheetTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Financial Details
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="p-4 space-y-4">
            {/* Part Header */}
            {part && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {part.featured_photo ? (
                      <img 
                        src={part.featured_photo} 
                        alt="" 
                        className="w-12 h-12 rounded object-contain bg-gray-800"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-600" />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{part.part_name}</h3>
                      {part.vendor_part_number && (
                        <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <PartTypeBadge partType={part.part_type} size="sm" />
                        <Badge className={cn(roleConfig.color, "text-white text-xs")}>
                          {roleConfig.label}
                        </Badge>
                        <Badge className={cn(marginConfig.bg, "text-white text-xs")}>
                          <MarginIcon className="w-3 h-3 mr-1" />
                          {marginConfig.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Section A: Client Billing Details */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  Client Billing
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                {/* Order Reference */}
                {order && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Order Reference</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">{order.po_number || `Order ${order.id?.slice(0, 8)}`}</span>
                      <ExternalLink className="w-3 h-3 text-blue-400 cursor-pointer" />
                    </div>
                  </div>
                )}

                {/* Line Override Indicator */}
                {financialStatus?.billing_source === 'LINE_OVERRIDE' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Billing Override</span>
                    <Badge className="bg-yellow-600/30 text-yellow-400 text-xs">
                      ⚡ Line Item Override Active
                    </Badge>
                  </div>
                )}

                {/* Commitment Reference */}
                {commitment && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Commitment</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-purple-400 border-purple-600 text-xs">
                        {commitment.commitment_status}
                      </Badge>
                      <Link2 className="w-3 h-3 text-purple-400 cursor-pointer" />
                    </div>
                  </div>
                )}

                <Separator className="bg-gray-700" />

                {/* Client Billing Status */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Billing Status</span>
                  <Badge className={cn(clientBillingConfig.bg, "text-white text-xs")}>
                    {clientBillingConfig.label}
                  </Badge>
                </div>

                {/* Client Payment Status */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Payment Status</span>
                  <Badge className={cn(clientPaymentConfig.bg, "text-white text-xs")}>
                    {clientPaymentConfig.label}
                  </Badge>
                </div>

                {/* Invoice Number if exists */}
                {order?.invoice_number && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Invoice #</span>
                    <span className="text-white text-sm">{order.invoice_number}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Section B: Vendor Cost Details */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-purple-400" />
                  Vendor Cost
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                {/* Vendor Name */}
                {vendor && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Vendor</span>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3 h-3 text-gray-400" />
                      <span className="text-white text-sm">{vendor.vendor_name}</span>
                    </div>
                  </div>
                )}

                {/* Vendor Invoice */}
                {vendorInvoice && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Vendor Invoice</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">{vendorInvoice.invoice_number}</span>
                      <ExternalLink className="w-3 h-3 text-blue-400 cursor-pointer" />
                    </div>
                  </div>
                )}

                <Separator className="bg-gray-700" />

                {/* Vendor Invoice Status */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Invoice Status</span>
                  <Badge className={cn(vendorInvoiceConfig.bg, "text-white text-xs")}>
                    {vendorInvoiceConfig.label}
                  </Badge>
                </div>

                {/* Vendor Payment Status */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Payment Status</span>
                  <Badge className={cn(vendorPaymentConfig.bg, "text-white text-xs")}>
                    {vendorPaymentConfig.label}
                  </Badge>
                </div>

                {/* No Vendor Cost for some part types */}
                {(financialStatus?.financial_role === 'LABOR_ONLY' || 
                  financialStatus?.financial_role === 'NON_BILLABLE') && (
                  <div className="bg-gray-700/30 rounded p-2 text-center">
                    <span className="text-xs text-gray-400">No vendor cost tracking for this part type</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Section C: Billing Timeline */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  Billing Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="space-y-2">
                  <TimelineItem 
                    icon={Package}
                    label="Part added to project"
                    date={commitment?.created_date || financialStatus?.created_date}
                  />
                  <TimelineItem 
                    icon={Receipt}
                    label="Vendor invoice received"
                    date={vendorInvoice?.invoice_date}
                    status={vendorInvoice ? vendorInvoiceConfig : null}
                  />
                  <TimelineItem 
                    icon={CheckCircle2}
                    label="Vendor invoice paid"
                    date={vendorInvoice?.invoice_status === 'paid' ? vendorInvoice?.posted_at : null}
                  />
                  <TimelineItem 
                    icon={FileText}
                    label="Client invoiced"
                    date={order?.invoice_date}
                    status={order?.billing_status === 'Client Invoiced' || order?.billing_status === 'Client Paid' ? clientBillingConfig : null}
                  />
                  <TimelineItem 
                    icon={DollarSign}
                    label="Client payment received"
                    date={order?.billing_status === 'Client Paid' ? financialStatus?.last_updated_at : null}
                    isLast
                  />
                </div>
              </CardContent>
            </Card>

            {/* Section: Lifecycle Context (Phase 7) */}
            {lifecycleContext && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="p-3 border-b border-gray-700">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-blue-400" />
                    Lifecycle Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  {lifecycleContext.lifecycle_category && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Category</span>
                      <Badge className="bg-blue-600 text-xs">
                        {LIFECYCLE_LABELS[lifecycleContext.lifecycle_category] || lifecycleContext.lifecycle_category}
                      </Badge>
                    </div>
                  )}

                  {lifecycleContext.ordering_safety && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Ordering Safety</span>
                      <Badge className={cn("text-xs", ORDERING_SAFETY_CONFIG[lifecycleContext.ordering_safety]?.color || 'bg-gray-600')}>
                        {lifecycleContext.ordering_safety} - {ORDERING_SAFETY_CONFIG[lifecycleContext.ordering_safety]?.label}
                      </Badge>
                    </div>
                  )}

                  {lifecycleContext.order_reference && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">PO Reference</span>
                      <span className="text-xs text-white">{lifecycleContext.order_reference}</span>
                    </div>
                  )}

                  {lifecycleContext.recommended_action && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Recommended</span>
                      <span className="text-xs text-green-400">{lifecycleContext.recommended_action}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Section E: Data Traceability */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="p-3 border-b border-gray-700">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-gray-400" />
                  Data Traceability
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Billing Source</span>
                  <Badge variant="outline" className="text-xs">
                    {BILLING_SOURCE_LABELS[financialStatus?.billing_source] || 'None'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Vendor Source</span>
                  <Badge variant="outline" className="text-xs">
                    {financialStatus?.vendor_source || 'None'}
                  </Badge>
                </div>

                <Separator className="bg-gray-700" />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Last Updated</span>
                  <span className="text-xs text-gray-300">
                    {financialStatus?.last_updated_at 
                      ? new Date(financialStatus.last_updated_at).toLocaleString()
                      : 'Unknown'}
                  </span>
                </div>

                {financialStatus?.commitment_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Commitment ID</span>
                    <span className="text-xs text-gray-500 font-mono">
                      {financialStatus.commitment_id.slice(0, 8)}...
                    </span>
                  </div>
                )}

                {financialStatus?.order_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Order ID</span>
                    <span className="text-xs text-gray-500 font-mono">
                      {financialStatus.order_id.slice(0, 8)}...
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* No Financial Data State */}
            {!financialStatus && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-8 text-center">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="text-gray-400">No financial data available</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Financial status will be calculated when orders or invoices are created.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}