import React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DollarSign, Truck, Building2, Calendar, Package, Receipt, CheckCircle2, FileText, ShoppingCart, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Section, InfoRow, StatusBadge, TimelineItem } from "./PartDetailPrimitives";
import { BILLING_SOURCE_LABELS, ORDERING_SAFETY_CONFIG, LIFECYCLE_LABELS } from "./partFinancialConfig";

export function ClientBillingSection({ fs, order, commitment, billing, payment }) {
  return (
    <Section icon={DollarSign} iconClass="text-green-400" title="Client Billing">
      {order && <InfoRow label="Order Reference"><span className="text-white text-sm">{order.po_number || `Order ${order.id?.slice(0, 8)}`}</span></InfoRow>}
      {fs?.billing_source === "LINE_OVERRIDE" && <InfoRow label="Billing Override"><Badge className="bg-yellow-600/30 text-yellow-400 text-xs">Line Item Override Active</Badge></InfoRow>}
      {commitment && <InfoRow label="Commitment"><Badge variant="outline" className="text-purple-400 border-purple-600 text-xs">{commitment.commitment_status}</Badge></InfoRow>}
      <Separator className="bg-gray-700" />
      <InfoRow label="Billing Status"><StatusBadge config={billing} /></InfoRow>
      <InfoRow label="Payment Status"><StatusBadge config={payment} /></InfoRow>
      {order?.invoice_number && <InfoRow label="Invoice #"><span className="text-white text-sm">{order.invoice_number}</span></InfoRow>}
    </Section>
  );
}

export function VendorCostSection({ fs, vendor, vendorInvoice, invoiceCfg, paymentCfg }) {
  const noVendorCost = fs?.financial_role === "LABOR_ONLY" || fs?.financial_role === "NON_BILLABLE";
  return (
    <Section icon={Truck} iconClass="text-purple-400" title="Vendor Cost">
      {vendor && <InfoRow label="Vendor"><Building2 className="w-3 h-3 text-gray-400" /><span className="text-white text-sm truncate">{vendor.vendor_name}</span></InfoRow>}
      {vendorInvoice && <InfoRow label="Vendor Invoice"><span className="text-white text-sm">{vendorInvoice.invoice_number}</span></InfoRow>}
      <Separator className="bg-gray-700" />
      <InfoRow label="Invoice Status"><StatusBadge config={invoiceCfg} /></InfoRow>
      <InfoRow label="Payment Status"><StatusBadge config={paymentCfg} /></InfoRow>
      {noVendorCost && <div className="bg-gray-700/30 rounded p-2 text-center text-xs text-gray-400">No vendor cost tracking for this part type</div>}
    </Section>
  );
}

export function BillingTimelineSection({ fs, order, commitment, vendorInvoice, invoiceCfg, billing }) {
  const clientInvoiced = order?.billing_status === "Client Invoiced" || order?.billing_status === "Client Paid";
  return (
    <Section icon={Calendar} iconClass="text-blue-400" title="Billing Timeline">
      <div className="space-y-2">
        <TimelineItem icon={Package} label="Part added to project" date={commitment?.created_date || fs?.created_date} />
        <TimelineItem icon={Receipt} label="Vendor invoice received" date={vendorInvoice?.invoice_date} status={vendorInvoice ? invoiceCfg : null} />
        <TimelineItem icon={CheckCircle2} label="Vendor invoice paid" date={vendorInvoice?.invoice_status === "paid" ? vendorInvoice?.posted_at : null} />
        <TimelineItem icon={FileText} label="Client invoiced" date={order?.invoice_date} status={clientInvoiced ? billing : null} />
        <TimelineItem icon={DollarSign} label="Client payment received" date={order?.billing_status === "Client Paid" ? fs?.last_updated_at : null} isLast />
      </div>
    </Section>
  );
}

export function LifecycleSection({ ctx }) {
  const safety = ORDERING_SAFETY_CONFIG[ctx.ordering_safety];
  return (
    <Section icon={ShoppingCart} iconClass="text-blue-400" title="Lifecycle Status">
      {ctx.lifecycle_category && <InfoRow label="Category"><Badge className="bg-blue-600 text-xs">{LIFECYCLE_LABELS[ctx.lifecycle_category] || ctx.lifecycle_category}</Badge></InfoRow>}
      {ctx.ordering_safety && <InfoRow label="Ordering Safety"><Badge className={cn("text-xs", safety?.color || "bg-gray-600")}>{ctx.ordering_safety} - {safety?.label}</Badge></InfoRow>}
      {ctx.order_reference && <InfoRow label="PO Reference"><span className="text-xs text-white">{ctx.order_reference}</span></InfoRow>}
      {ctx.recommended_action && <InfoRow label="Recommended"><span className="text-xs text-green-400">{ctx.recommended_action}</span></InfoRow>}
    </Section>
  );
}

export function TraceabilitySection({ fs }) {
  return (
    <Section icon={Link2} iconClass="text-gray-400" title="Data Traceability">
      <InfoRow label="Billing Source"><Badge variant="outline" className="text-xs">{BILLING_SOURCE_LABELS[fs?.billing_source] || "None"}</Badge></InfoRow>
      <InfoRow label="Vendor Source"><Badge variant="outline" className="text-xs">{fs?.vendor_source || "None"}</Badge></InfoRow>
      <Separator className="bg-gray-700" />
      <InfoRow label="Last Updated"><span className="text-xs text-gray-300">{fs?.last_updated_at ? new Date(fs.last_updated_at).toLocaleString() : "Unknown"}</span></InfoRow>
      {fs?.commitment_id && <InfoRow label="Commitment ID"><span className="text-xs text-gray-500 font-mono">{fs.commitment_id.slice(0, 8)}...</span></InfoRow>}
      {fs?.order_id && <InfoRow label="Order ID"><span className="text-xs text-gray-500 font-mono">{fs.order_id.slice(0, 8)}...</span></InfoRow>}
    </Section>
  );
}