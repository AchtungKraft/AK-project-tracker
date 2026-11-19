import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Package, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PartTypeBadge } from "@/components/parts/PartTypeSelector";
import { usePartFinancialData } from "./usePartFinancialData";
import * as C from "./partFinancialConfig";
import { ClientBillingSection, VendorCostSection, BillingTimelineSection, LifecycleSection, TraceabilitySection } from "./PartFinancialSections";

/** Read-only part-level financial detail (restored for the Financial Exceptions page). */
export default function PartFinancialDetailDrawer({ isOpen, onClose, partId, financialStatus: fs, lifecycleContext }) {
  const { part, order, vendorInvoice, vendor, commitment } = usePartFinancialData({ isOpen, partId, financialStatus: fs });
  const billing = C.pick(C.CLIENT_BILLING_COLORS, fs?.client_billing_status, "NOT_INVOICED");
  const payment = C.pick(C.CLIENT_PAYMENT_COLORS, fs?.client_payment_status, "PENDING");
  const invoiceCfg = C.pick(C.VENDOR_INVOICE_COLORS, fs?.vendor_invoice_status, "NOT_RECEIVED");
  const paymentCfg = C.pick(C.VENDOR_PAYMENT_COLORS, fs?.vendor_payment_status, "UNPAID");
  const margin = C.pick(C.MARGIN_STATE_COLORS, fs?.margin_state, "UNKNOWN");
  const role = C.pick(C.FINANCIAL_ROLE_LABELS, fs?.financial_role, "VENDOR_MARGIN");
  const MarginIcon = margin.icon;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-gray-900 border-gray-700 p-0 overflow-hidden">
        <SheetHeader className="p-4 border-b border-gray-700">
          <SheetTitle className="text-white flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-400" />Financial Details</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="p-4 space-y-4">
            {part && (
              <Card className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-start gap-3">
                {part.featured_photo
                  ? <img src={part.featured_photo} alt="" className="w-12 h-12 rounded object-contain bg-gray-800" />
                  : <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center"><Package className="w-6 h-6 text-gray-600" /></div>}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium">{part.part_name}</h3>
                  {part.vendor_part_number && <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <PartTypeBadge partType={part.part_type} size="sm" />
                    <Badge className={cn(role.color, "text-white text-xs")}>{role.label}</Badge>
                    <Badge className={cn(margin.bg, "text-white text-xs")}><MarginIcon className="w-3 h-3 mr-1" />{margin.label}</Badge>
                  </div>
                </div>
              </CardContent></Card>
            )}
            <ClientBillingSection fs={fs} order={order} commitment={commitment} billing={billing} payment={payment} />
            <VendorCostSection fs={fs} vendor={vendor} vendorInvoice={vendorInvoice} invoiceCfg={invoiceCfg} paymentCfg={paymentCfg} />
            <BillingTimelineSection fs={fs} order={order} commitment={commitment} vendorInvoice={vendorInvoice} invoiceCfg={invoiceCfg} billing={billing} />
            {lifecycleContext && <LifecycleSection ctx={lifecycleContext} />}
            <TraceabilitySection fs={fs} />
            {!fs && (
              <Card className="bg-gray-800/50 border-gray-700"><CardContent className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-400">No financial data available</p>
                <p className="text-xs text-gray-500 mt-1">Financial status will be calculated when orders or invoices are created.</p>
              </CardContent></Card>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}