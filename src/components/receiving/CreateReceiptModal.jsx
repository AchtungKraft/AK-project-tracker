import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Package, Upload, X } from "lucide-react";

export default function CreateReceiptModal({ open, onOpenChange, orderId = null, vendorId = null }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    order_id: orderId || "",
    vendor_id: vendorId || "",
    received_by: "",
    received_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: "",
    receipt_photos: [],
    receipt_status: "draft"
  });
  const [uploading, setUploading] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list(),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Generate receipt number
      const today = format(new Date(), "yyyyMMdd");
      const existingReceipts = await base44.entities.InventoryReceipt.filter({});
      const todayReceipts = existingReceipts.filter(r => 
        r.receipt_number?.startsWith(`RCV-${today}`)
      );
      const seq = String(todayReceipts.length + 1).padStart(3, '0');
      const receipt_number = `RCV-${today}-${seq}`;
      
      return base44.entities.InventoryReceipt.create({
        ...data,
        receipt_number
      });
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['inventoryReceipts'] });
      toast.success(`Receipt ${receipt.receipt_number} created`);
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to create receipt: " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      order_id: "",
      vendor_id: "",
      received_by: "",
      received_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      notes: "",
      receipt_photos: [],
      receipt_status: "draft"
    });
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploading(true);
    const uploadedUrls = [];
    
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      uploadedUrls.push(file_url);
    }
    
    setFormData(prev => ({
      ...prev,
      receipt_photos: [...prev.receipt_photos, ...uploadedUrls]
    }));
    setUploading(false);
  };

  const removePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      receipt_photos: prev.receipt_photos.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = () => {
    if (!formData.received_by) {
      toast.error("Please select who received the items");
      return;
    }
    createMutation.mutate(formData);
  };

  const activeOrders = orders.filter(o => 
    o.status === 'Ordered' || o.status === 'Partial'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-red-500" />
            Create Receiving Receipt
          </DialogTitle>
          <DialogDescription>
            Create a new receipt to document incoming inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Order Selection */}
          <div>
            <Label className="text-gray-300">Link to Order (Optional)</Label>
            <Select
              value={formData.order_id}
              onValueChange={(v) => {
                const order = orders.find(o => o.id === v);
                setFormData(prev => ({
                  ...prev,
                  order_id: v,
                  vendor_id: order?.vendor_id || prev.vendor_id
                }));
              }}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select order..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>No Order</SelectItem>
                {activeOrders.map(order => (
                  <SelectItem key={order.id} value={order.id}>
                    {order.po_number} - {vendors.find(v => v.id === order.vendor_id)?.vendor_name || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vendor Selection */}
          {!formData.order_id && (
            <div>
              <Label className="text-gray-300">Vendor (Optional)</Label>
              <Select
                value={formData.vendor_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, vendor_id: v }))}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>No Vendor</SelectItem>
                  {vendors.filter(v => v.active).map(vendor => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.vendor_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Received By */}
          <div>
            <Label className="text-gray-300">Received By *</Label>
            <Select
              value={formData.received_by}
              onValueChange={(v) => setFormData(prev => ({ ...prev, received_by: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select team member..." />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.filter(t => t.active).map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Received At */}
          <div>
            <Label className="text-gray-300">Received At</Label>
            <Input
              type="datetime-local"
              value={formData.received_at}
              onChange={(e) => setFormData(prev => ({ ...prev, received_at: e.target.value }))}
              className="bg-gray-800 border-gray-700"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any notes about this receipt..."
              className="bg-gray-800 border-gray-700"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <Label className="text-gray-300">Receipt Photos</Label>
            <div className="mt-2">
              <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-red-500/50 transition-colors">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-400">
                  {uploading ? "Uploading..." : "Click to upload photos"}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            {formData.receipt_photos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.receipt_photos.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={url}
                      alt={`Receipt photo ${idx + 1}`}
                      className="w-16 h-16 object-cover rounded border border-gray-700"
                    />
                    <button
                      onClick={() => removePhoto(idx)}
                      className="absolute -top-1 -right-1 bg-red-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !formData.received_by}
          >
            {createMutation.isPending ? "Creating..." : "Create Receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}