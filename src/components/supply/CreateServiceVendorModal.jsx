import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

/**
 * CreateServiceVendorModal — Full vendor creation with locked group context
 *
 * Always creates via executeServiceAction.CREATE_SERVICE_VENDOR
 * with full metadata + auto-assigned vendor_group_id.
 */
export default function CreateServiceVendorModal({ open, onClose, onCreated, serviceGroupId, serviceGroupName }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [cellPhone, setCellPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Vendor name required"); return; }
    if (!serviceGroupId) { toast.error("No vendor group context — select a service first"); return; }

    setSaving(true);
    try {
      const res = await base44.functions.invoke("executeServiceAction", {
        action_type: "CREATE_SERVICE_VENDOR",
        name: name.trim(),
        vendor_group_id: serviceGroupId,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        cell_phone: cellPhone.trim() || null,
        address: address.trim() || null,
        website: website.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`Vendor "${name.trim()}" created`);
      queryClient.invalidateQueries({ queryKey: ["serviceVendors"] });
      queryClient.invalidateQueries({ queryKey: ["serviceVendors-admin"] });
      onCreated?.(res.data.vendor);
      handleClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setCellPhone("");
    setAddress("");
    setWebsite("");
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">New Service Vendor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Locked vendor group */}
          <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded px-3 py-2">
            <Lock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-xs text-gray-400">Vendor Group:</span>
            <Badge variant="outline" className="text-xs border-purple-600/50 text-purple-400">
              {serviceGroupName || "Service Group"}
            </Badge>
          </div>

          <div>
            <Label className="text-gray-300 text-xs">Vendor Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Chrome Plating Co." className="bg-gray-800 border-gray-600 text-white mt-1" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 text-xs">Contact Name</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Primary contact" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Contact Email</Label>
              <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@vendor.com" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Contact Phone</Label>
              <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(555) 123-4567" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Cell Phone</Label>
              <Input value={cellPhone} onChange={e => setCellPhone(e.target.value)} placeholder="(555) 987-6543" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Vendor address" className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Website</Label>
            <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://vendor.com" className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {saving ? "Creating..." : "Create Vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}