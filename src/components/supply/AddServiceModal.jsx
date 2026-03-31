import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AddServiceModal({ projectId, open, onClose, onSuccess }) {
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.filter({ is_active: true }),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: () => base44.entities.Vendor.filter({ active: true }),
  });

  const selectedService = services.find(s => s.id === serviceId);

  const handleSave = async () => {
    if (!serviceId || !description) {
      toast.error("Service and description are required");
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "CREATE",
        project_id: projectId,
        service_id: serviceId,
        description,
        vendor_id: vendorId || selectedService?.default_vendor_id || null,
        estimated_cost: parseFloat(estimatedCost) || 0,
        quantity: parseInt(quantity) || 1,
        notes,
      });
      toast.success("Service added");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Failed to add service: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add Service to Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-gray-300">Service *</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select a service..." />
              </SelectTrigger>
              <SelectContent>
                {services.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.category ? `(${s.category})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300">Description *</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Shipment #2, Chrome plating batch"
              className="bg-gray-800 border-gray-600 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-gray-300">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select vendor (optional)..." />
              </SelectTrigger>
              <SelectContent>
                {vendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.vendor_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300">Estimated Cost</Label>
              <Input
                type="number"
                step="0.01"
                value={estimatedCost}
                onChange={e => setEstimatedCost(e.target.value)}
                placeholder="0.00"
                className="bg-gray-800 border-gray-600 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-300">Quantity</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="bg-gray-800 border-gray-600 text-white mt-1"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !serviceId || !description}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}