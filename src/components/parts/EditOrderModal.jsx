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
import { Loader2, FileText, Save } from "lucide-react";

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
    order_date: order?.order_date || '',
    eta_date: order?.eta_date || '',
    notes: order?.notes || '',
    vendor_id: order?.vendor_id || '',
  });

  const isFullyReceived = order?.status === 'Received';

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Order.update(order.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
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
      order_date: formData.order_date || null,
      eta_date: formData.eta_date || null,
      notes: formData.notes || null,
      vendor_id: formData.vendor_id || null,
    });
  };

  const getVendorName = (vendorId) => {
    return vendors.find(v => v.id === vendorId)?.vendor_name || 'Unknown';
  };

  const activeVendors = vendors.filter(v => v.active);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-yellow-900/30 text-white max-w-md">
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
            This order has been fully received. Metadata is read-only.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-400 text-xs">PO Number</Label>
            <Input
              value={formData.po_number}
              onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
              placeholder="PO-12345"
              className="bg-gray-800 border-gray-700"
              disabled={isFullyReceived}
            />
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
            <Label className="text-gray-400 text-xs">Notes / Reference URL</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Order notes, tracking links, invoice URLs..."
              className="bg-gray-800 border-gray-700 h-20"
              disabled={isFullyReceived}
            />
            {formData.notes && formData.notes.startsWith('http') && (
              <a 
                href={formData.notes}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline mt-1 inline-block"
              >
                Open link →
              </a>
            )}
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