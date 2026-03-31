import React, { useState, useMemo } from "react";
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
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

/**
 * EditServiceModal — Edit core fields of a ServiceCommitment.
 *
 * Props:
 *  - commitment: the ServiceCommitment record
 *  - open / onClose / onSuccess
 */
export default function EditServiceModal({ commitment, open, onClose, onSuccess }) {
  const [serviceId, setServiceId] = useState(commitment.service_id || "");
  const [vendorId, setVendorId] = useState(commitment.vendor_id || "");
  const [description, setDescription] = useState(commitment.description || "");
  const [quantity, setQuantity] = useState(String(commitment.quantity || 1));
  const [notes, setNotes] = useState(commitment.notes || "");
  const [saving, setSaving] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.filter({ is_active: true }),
  });

  const { data: serviceVendors = [] } = useQuery({
    queryKey: ["serviceVendors"],
    queryFn: () => base44.entities.ServiceVendor.filter({ is_active: true }),
  });

  const selectedService = services.find(s => s.id === serviceId);

  const filteredVendors = useMemo(() => {
    if (!selectedService?.allowed_vendor_ids?.length) return serviceVendors;
    return serviceVendors.filter(v => selectedService.allowed_vendor_ids.includes(v.id));
  }, [selectedService, serviceVendors]);

  const isBilled = commitment.status === "billed";

  const handleSave = async () => {
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    setSaving(true);
    const payload = {
      action_type: "UPDATE_SERVICE",
      commitment_id: commitment.id,
      service_id: serviceId,
      vendor_id: (vendorId && vendorId !== "__none__") ? vendorId : null,
      description: description.trim(),
      quantity: parseInt(quantity) || 1,
      notes: notes.trim() || null,
    };
    try {
      await base44.functions.invoke("executeServiceAction", payload);
      toast.success("Service updated");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Failed to update: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Service Commitment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-gray-300">Service *</Label>
            <Select value={serviceId} onValueChange={setServiceId} disabled={isBilled}>
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
              className="bg-gray-800 border-gray-600 text-white mt-1"
              disabled={isBilled}
            />
          </div>

          <div>
            <Label className="text-gray-300">Service Vendor</Label>
            <Select value={vendorId || "__none__"} onValueChange={setVendorId} disabled={isBilled}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select vendor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {filteredVendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-gray-300">Quantity</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white mt-1"
              disabled={isBilled}
            />
          </div>

          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white mt-1"
              rows={2}
              disabled={isBilled}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || isBilled || !description.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}