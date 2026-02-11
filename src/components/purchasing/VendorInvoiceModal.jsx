import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Plus, Trash2, Upload, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * VendorInvoiceModal - Create/edit vendor invoice attached to PO
 */
export default function VendorInvoiceModal({ 
  order,
  existingInvoice,
  onClose 
}) {
  const queryClient = useQueryClient();
  const isEditing = !!existingInvoice;

  const [invoice, setInvoice] = useState(existingInvoice || {
    invoice_number: '',
    invoice_date: format(new Date(), 'yyyy-MM-dd'),
    vendor_id: order?.vendor_id,
    order_id: order?.id,
    freight_cost: 0,
    tax_cost: 0,
    invoice_status: 'draft',
    notes: '',
  });

  // Fetch PO line items
  const { data: lineItems = [] } = useQuery({
    queryKey: ['purchaseLineItems', order?.id],
    queryFn: async () => {
      const all = await base44.entities.PartPurchaseLineItem.list();
      return all.filter(li => li.order_id === order?.id);
    },
    enabled: !!order?.id,
  });

  // Fetch parts for display
  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
  });
  const partsMap = Object.fromEntries(parts.map(p => [p.id, p]));

  // Fetch existing invoice line items if editing
  const { data: existingLineItems = [] } = useQuery({
    queryKey: ['invoiceLineItems', existingInvoice?.id],
    queryFn: async () => {
      const all = await base44.entities.VendorInvoiceLineItem.list();
      return all.filter(ili => ili.invoice_id === existingInvoice?.id);
    },
    enabled: !!existingInvoice?.id,
  });

  // Initialize invoice lines from PO or existing
  const [invoiceLines, setInvoiceLines] = useState(() => {
    if (existingLineItems.length > 0) {
      return existingLineItems;
    }
    return lineItems.map(li => ({
      purchase_line_item_id: li.id,
      part_id: li.part_id,
      qty_invoiced: li.qty_ordered || 0,
      actual_unit_cost: li.unit_cost || 0,
      extended_cost: (li.qty_ordered || 0) * (li.unit_cost || 0),
      freight_allocation: 0,
    }));
  });

  // Update lines when lineItems load
  React.useEffect(() => {
    if (lineItems.length > 0 && invoiceLines.length === 0 && !isEditing) {
      setInvoiceLines(lineItems.map(li => ({
        purchase_line_item_id: li.id,
        part_id: li.part_id,
        qty_invoiced: li.qty_ordered || 0,
        actual_unit_cost: li.unit_cost || 0,
        extended_cost: (li.qty_ordered || 0) * (li.unit_cost || 0),
        freight_allocation: 0,
      })));
    }
  }, [lineItems, isEditing]);

  // Calculate totals
  const subtotal = invoiceLines.reduce((sum, line) => sum + (line.extended_cost || 0), 0);
  const total = subtotal + (parseFloat(invoice.freight_cost) || 0) + (parseFloat(invoice.tax_cost) || 0);

  // Update line item
  const updateLine = (index, field, value) => {
    setInvoiceLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Recalculate extended cost
      if (field === 'qty_invoiced' || field === 'actual_unit_cost') {
        updated[index].extended_cost = 
          (updated[index].qty_invoiced || 0) * (updated[index].actual_unit_cost || 0);
      }
      
      return updated;
    });
  };

  // Distribute freight across lines
  const distributeFreight = () => {
    const freight = parseFloat(invoice.freight_cost) || 0;
    if (freight === 0 || subtotal === 0) return;
    
    setInvoiceLines(prev => prev.map(line => ({
      ...line,
      freight_allocation: (line.extended_cost / subtotal) * freight,
      landed_unit_cost: line.actual_unit_cost + 
        (((line.extended_cost / subtotal) * freight) / (line.qty_invoiced || 1))
    })));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Create or update invoice
      let invoiceRecord;
      if (isEditing) {
        invoiceRecord = await base44.entities.VendorInvoice.update(existingInvoice.id, {
          ...invoice,
          subtotal,
          total_invoice_cost: total,
        });
      } else {
        invoiceRecord = await base44.entities.VendorInvoice.create({
          ...invoice,
          subtotal,
          total_invoice_cost: total,
        });
      }

      // Delete old line items if editing
      if (isEditing && existingLineItems.length > 0) {
        for (const ili of existingLineItems) {
          await base44.entities.VendorInvoiceLineItem.delete(ili.id);
        }
      }

      // Create line items
      for (const line of invoiceLines) {
        if (line.qty_invoiced > 0) {
          await base44.entities.VendorInvoiceLineItem.create({
            invoice_id: invoiceRecord.id,
            purchase_line_item_id: line.purchase_line_item_id,
            part_id: line.part_id,
            qty_invoiced: line.qty_invoiced,
            actual_unit_cost: line.actual_unit_cost,
            extended_cost: line.extended_cost,
            freight_allocation: line.freight_allocation || 0,
            landed_unit_cost: line.landed_unit_cost || line.actual_unit_cost,
          });
        }
      }

      return invoiceRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendorInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoiceLineItems'] });
      queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
      toast.success(isEditing ? 'Invoice updated' : 'Invoice created');
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    }
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-blue-400" />
            {isEditing ? 'Edit Vendor Invoice' : 'Create Vendor Invoice'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-gray-300">Invoice Number*</Label>
              <Input
                value={invoice.invoice_number}
                onChange={(e) => setInvoice({ ...invoice, invoice_number: e.target.value })}
                placeholder="INV-12345"
                className="bg-gray-800 border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-300">Invoice Date*</Label>
              <Input
                type="date"
                value={invoice.invoice_date}
                onChange={(e) => setInvoice({ ...invoice, invoice_date: e.target.value })}
                className="bg-gray-800 border-gray-600"
              />
            </div>
            <div>
              <Label className="text-gray-300">Freight</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={invoice.freight_cost}
                  onChange={(e) => setInvoice({ ...invoice, freight_cost: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 border-gray-600"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon"
                  onClick={distributeFreight}
                  title="Distribute freight"
                  className="border-gray-600"
                >
                  <DollarSign className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-gray-300">Tax</Label>
              <Input
                type="number"
                step="0.01"
                value={invoice.tax_cost}
                onChange={(e) => setInvoice({ ...invoice, tax_cost: parseFloat(e.target.value) || 0 })}
                className="bg-gray-800 border-gray-600"
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <Label className="text-gray-300 mb-2 block">Line Items</Label>
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-700">
                    <TableHead className="text-gray-400">Part</TableHead>
                    <TableHead className="text-gray-400 text-right w-24">Qty</TableHead>
                    <TableHead className="text-gray-400 text-right w-32">Unit Cost</TableHead>
                    <TableHead className="text-gray-400 text-right w-32">Extended</TableHead>
                    <TableHead className="text-gray-400 text-right w-28">Freight Alloc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceLines.map((line, index) => {
                    const part = partsMap[line.part_id];
                    const poLine = lineItems.find(li => li.id === line.purchase_line_item_id);
                    const variance = poLine?.unit_cost && line.actual_unit_cost !== poLine.unit_cost;
                    
                    return (
                      <TableRow key={index} className="border-gray-700">
                        <TableCell>
                          <div>
                            <p className="text-white text-sm">{part?.part_name || 'Unknown'}</p>
                            {part?.vendor_part_number && (
                              <p className="text-xs text-gray-500">{part.vendor_part_number}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={line.qty_invoiced}
                            onChange={(e) => updateLine(index, 'qty_invoiced', parseInt(e.target.value) || 0)}
                            className="bg-gray-800 border-gray-600 w-20 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-end gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              value={line.actual_unit_cost}
                              onChange={(e) => updateLine(index, 'actual_unit_cost', parseFloat(e.target.value) || 0)}
                              className="bg-gray-800 border-gray-600 w-28 text-right"
                            />
                            {variance && (
                              <span className="text-xs text-yellow-500">
                                PO: ${poLine.unit_cost.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-white">
                          ${(line.extended_cost || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-gray-400">
                          ${(line.freight_allocation || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-right">
              <div>
                <p className="text-xs text-gray-400">Subtotal</p>
                <p className="text-lg text-white">${subtotal.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Freight + Tax</p>
                <p className="text-lg text-white">
                  ${((parseFloat(invoice.freight_cost) || 0) + (parseFloat(invoice.tax_cost) || 0)).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total</p>
                <p className="text-xl font-bold text-green-400">${total.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={invoice.notes}
              onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
              placeholder="Invoice notes..."
              className="bg-gray-800 border-gray-600"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button 
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !invoice.invoice_number}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update Invoice' : 'Create Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}