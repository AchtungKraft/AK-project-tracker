import React, { useState, useMemo, useEffect } from "react";
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
import { Loader2, Save, FolderKanban, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import GroupedProjectSelector from "@/components/supply/GroupedProjectSelector";

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

  // Project reassignment state
  const [allowReassign, setAllowReassign] = useState(false);
  const [newProjectId, setNewProjectId] = useState(commitment.project_id || "");
  const [projectSearch, setProjectSearch] = useState("");
  const [showReassignConfirm, setShowReassignConfirm] = useState(false);
  const [pendingSave, setPendingSave] = useState(null);

  // Check if user is admin
  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
  });
  const isAdmin = currentUser?.role === "admin";

  // Fetch current project name for display
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-for-reassign"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
    enabled: isAdmin,
  });
  const currentProjectName = projects.find(p => p.id === commitment.project_id)?.name || "Unknown";
  const newProjectName = projects.find(p => p.id === newProjectId)?.name || "";
  const projectChanged = newProjectId !== commitment.project_id;

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

  const executeSave = async (confirmedReassign = false) => {
    setSaving(true);
    try {
      // If project changed and confirmed, do reassignment first
      if (projectChanged && confirmedReassign) {
        await base44.functions.invoke("executeServiceAction", {
          action_type: "REASSIGN_PROJECT",
          commitment_id: commitment.id,
          new_project_id: newProjectId,
        });
      }

      // Then update other fields
      const payload = {
        action_type: "UPDATE_SERVICE",
        commitment_id: commitment.id,
        service_id: serviceId,
        vendor_id: (vendorId && vendorId !== "__none__") ? vendorId : null,
        description: description.trim(),
        quantity: parseInt(quantity) || 1,
        notes: notes.trim() || null,
      };
      await base44.functions.invoke("executeServiceAction", payload);
      toast.success(projectChanged && confirmedReassign ? "Service moved and updated" : "Service updated");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error("Failed to update: " + err.message);
    } finally {
      setSaving(false);
      setPendingSave(null);
    }
  };

  const handleSave = async () => {
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    // If project changed, show confirmation
    if (projectChanged) {
      setShowReassignConfirm(true);
      return;
    }
    await executeSave(false);
  };

  const handleConfirmReassign = async () => {
    setShowReassignConfirm(false);
    await executeSave(true);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Service Commitment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          {/* ── Project Reassignment Section ── */}
          {isAdmin && (
            <div className="space-y-3 pb-3 border-b border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-blue-400" />
                  <Label className="text-gray-300 font-medium">Project</Label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Allow reassignment</span>
                  <Switch
                    checked={allowReassign}
                    onCheckedChange={(v) => {
                      setAllowReassign(v);
                      if (!v) setNewProjectId(commitment.project_id);
                    }}
                    disabled={isBilled}
                  />
                </div>
              </div>
              {allowReassign ? (
                <div className="space-y-2">
                  <GroupedProjectSelector
                    selectedProjectId={newProjectId}
                    onSelect={setNewProjectId}
                    searchTerm={projectSearch}
                    onSearchChange={setProjectSearch}
                  />
                  {projectChanged && (
                    <div className="flex items-center gap-2 p-2 bg-amber-900/30 border border-amber-700/50 rounded text-amber-300 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Will move from <strong>{currentProjectName}</strong> to <strong>{newProjectName}</strong></span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-800/50 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300">
                  {currentProjectName}
                </div>
              )}
            </div>
          )}

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

      {/* Reassignment Confirmation Dialog */}
      <AlertDialog open={showReassignConfirm} onOpenChange={setShowReassignConfirm}>
        <AlertDialogContent className="bg-gray-900 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Move Service to Another Project?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will reassign the service commitment and all its line items from{" "}
              <strong className="text-white">{currentProjectName}</strong> to{" "}
              <strong className="text-white">{newProjectName}</strong>.
              <br /><br />
              This action will be logged for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReassign} className="bg-amber-600 hover:bg-amber-700">
              Yes, Move Service
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}