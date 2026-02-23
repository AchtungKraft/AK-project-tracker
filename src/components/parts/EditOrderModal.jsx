import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, Save, DollarSign, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * EditOrderModal - Edit order-level metadata (PO#, date, notes, URL)
 * Does NOT affect line items, quantities, or inventory
 */
export default function EditOrderModal({ order, onClose }) {
  const queryClient = useQueryClient();
  
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const [formData, setFormData] = useState({
    po_number: order?.po_number || '',
    order_number: order?.order_number || '',
    order_url: order?.order_url || '',
    order_date: order?.order_date || '',
    eta_date: order?.eta_date || '',
    notes: order?.notes || '',
    vendor_id: order?.vendor_id || '',
    billing_status: order?.billing_status || 'Not Invoiced',
    invoice_number: order?.invoice_number || '',
    invoice_date: order?.invoice_date || '',
    invoice_notes: order?.invoice_notes || '',
  });

  const isFullyReceived = order?.status === 'Received';

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Order.update(order.id, data),
    onSuccess: async () => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        orderIds: [order.id],
      });
      toast.success('Order updated');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to update order: ' + error.message);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate({
      po_number: formData.po_number || null,
      order_number: formData.order_number || null,
      order_url: formData.order_url || null,
      order_date: formData.order_date || null,
      eta_date: formData.eta_date || null,
      notes: formData.notes || null,
      vendor_id: formData.vendor_id || null,
      billing_status: formData.billing_status || 'Not Invoiced',
      invoice_number: formData.invoice_number || null,
      invoice_date: formData.invoice_date || null,
      invoice_notes: formData.invoice_notes || null,
    });
  };

  const getVendorName = (vendorId) => {
    return vendors.find(v => v.id === vendorId)?.vendor_name || 'Unknown';
  };

  const activeVendors = vendors.filter(v => v.active);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-yellow-900/30 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-yellow-400" />
            Edit Order
            <Badge 
              variant="outline" 
              className={
                order?.status === 'Received' ? 'border-green-500 text-green-400' :
                order?.status === 'Partial' ? 'border-orange-500 text-orange-400' :
                'border-yellow-500 text-yellow-400'
              }
            >
              {order?.status || 'Ordered'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isFullyReceived && (
          <div className="p-3 bg-green-900/20 border border-green-700/30 rounded-lg text-sm text-green-400">
            This order has been fully received. Order metadata is read-only, but billing can still be updated.
          </div>
        )}
        
        <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg text-xs text-blue-300">
          <strong>Billing Authority:</strong> Order-level billing is the source of truth. Parts inherit billing status from this order by default.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">PO Number</Label>
              <Input
                value={formData.po_number}
                onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                placeholder="AK_01202026_001"
                className="bg-gray-800 border-gray-700"
                disabled={isFullyReceived}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Order / Confirmation #</Label>
              <Input
                value={formData.order_number}
                onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                placeholder="Vendor's order number"
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Order URL</Label>
            <div className="flex gap-2">
              <Input
                value={formData.order_url}
                onChange={(e) => setFormData({ ...formData, order_url: e.target.value })}
                placeholder="https://..."
                className="bg-gray-800 border-gray-700 flex-1"
              />
              {formData.order_url && (
                <a 
                  href={formData.order_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-9 h-9 bg-gray-800 border border-gray-700 rounded-md text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Vendor</Label>
            <Select
              value={formData.vendor_id}
              onValueChange={(v) => setFormData({ ...formData, vendor_id: v })}
              disabled={isFullyReceived}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select vendor..." />
              </SelectTrigger>
              <SelectContent>
                {activeVendors.filter(v => !v.parent_id).map(parent => {
                  const children = activeVendors.filter(v => v.parent_id === parent.id);
                  return (
                    <React.Fragment key={parent.id}>
                      <SelectItem value={parent.id}>
                        <span style={{ color: parent.color }}>{parent.vendor_name}</span>
                      </SelectItem>
                      {children.map(child => (
                        <SelectItem key={child.id} value={child.id}>
                          <span className="ml-4" style={{ color: child.color }}>→ {child.vendor_name}</span>
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Order Date</Label>
              <Input
                type="date"
                value={formData.order_date}
                onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                className="bg-gray-800 border-gray-700"
                disabled={isFullyReceived}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">ETA Date</Label>
              <Input
                type="date"
                value={formData.eta_date}
                onChange={(e) => setFormData({ ...formData, eta_date: e.target.value })}
                className="bg-gray-800 border-gray-700"
                disabled={isFullyReceived}
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-400 text-xs">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Order notes..."
              className="bg-gray-800 border-gray-700 h-16"
            />
          </div>

          <Separator className="bg-gray-700" />

          {/* Billing Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <DollarSign className="w-4 h-4" />
              <span className="font-medium">Billing</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Billing Status</Label>
                <Select
                  value={formData.billing_status}
                  onValueChange={(v) => setFormData({ ...formData, billing_status: v })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Not Invoiced">Not Invoiced</SelectItem>
                    <SelectItem value="Client Invoiced">Client Invoiced</SelectItem>
                    <SelectItem value="Client Paid">Client Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Invoice Number</Label>
                <Input
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                  placeholder="INV-001"
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Invoice Date</Label>
                <Input
                  type="date"
                  value={formData.invoice_date}
                  onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Invoice Notes</Label>
                <Input
                  value={formData.invoice_notes}
                  onChange={(e) => setFormData({ ...formData, invoice_notes: e.target.value })}
                  placeholder="Billing notes..."
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              {isFullyReceived ? 'Close' : 'Cancel'}
            </Button>
            {!isFullyReceived && (
              <Button
                type="submit"
                className="bg-yellow-600 hover:bg-yellow-700"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}