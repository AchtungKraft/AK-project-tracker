import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Read-only lookups for the part financial detail drawer.
const first = async (entity, id) => (await base44.entities[entity].filter({ id }))[0] || null;

export function usePartFinancialData({ isOpen, partId, financialStatus }) {
  const orderId = financialStatus?.order_id;
  const vendorInvoiceId = financialStatus?.vendor_invoice_id;
  const commitmentId = financialStatus?.commitment_id;

  const { data: part } = useQuery({ queryKey: ["part", partId], queryFn: () => first("Part", partId), enabled: isOpen && !!partId });
  const { data: order } = useQuery({ queryKey: ["order", orderId], queryFn: () => first("Order", orderId), enabled: isOpen && !!orderId });
  const { data: vendorInvoice } = useQuery({ queryKey: ["vendorInvoice", vendorInvoiceId], queryFn: () => first("VendorInvoice", vendorInvoiceId), enabled: isOpen && !!vendorInvoiceId });
  const vendorId = vendorInvoice?.vendor_id || part?.default_vendor_id;
  const { data: vendor } = useQuery({ queryKey: ["vendor", vendorId], queryFn: () => first("Vendor", vendorId), enabled: isOpen && !!vendorId });
  const { data: commitment } = useQuery({ queryKey: ["commitment", commitmentId], queryFn: () => first("PartCommitment", commitmentId), enabled: isOpen && !!commitmentId });

  return { part, order, vendorInvoice, vendor, commitment };
}