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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, FolderKanban, Search } from "lucide-react";
import { toast } from "sonner";

/**
 * AddServiceModal - Create a ServiceCommitment for a project.
 *
 * Props:
 *  - projectId: string | null — when provided, project is locked (project-scoped context)
 *  - projectName: string | null — display name when project is locked
 *  - open: boolean
 *  - onClose: () => void
 *  - onSuccess: () => void
 */
export default function AddServiceModal({ projectId: lockedProjectId, projectName: lockedProjectName, open, onClose, onSuccess }) {
  const isProjectLocked = !!lockedProjectId;

  const [selectedProjectId, setSelectedProjectId] = useState(lockedProjectId || "");
  const [projectSearch, setProjectSearch] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline vendor creation
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [creatingVendor, setCreatingVendor] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.filter({ is_active: true }),
  });

  const { data: serviceVendors = [] } = useQuery({
    queryKey: ["serviceVendors"],
    queryFn: () => base44.entities.ServiceVendor.filter({ is_active: true }),
  });

  // Only fetch projects when not locked to a project
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-for-service-modal"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
    enabled: !isProjectLocked,
  });

  const selectedService = services.find(s => s.id === serviceId);

  // Filter vendors: show allowed vendors for selected service, or all if none set
  const filteredVendors = useMemo(() => {
    if (!selectedService?.allowed_vendor_ids?.length) return serviceVendors;
    return serviceVendors.filter(v => selectedService.allowed_vendor_ids.includes(v.id));
  }, [selectedService, serviceVendors]);

  // Filter projects by search
  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const term = projectSearch.toLowerCase();
    return projects.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.client_name?.toLowerCase().includes(term)
    );
  }, [projects, projectSearch]);

  const resolvedProjectId = isProjectLocked ? lockedProjectId : selectedProjectId;
  const resolvedProjectName = isProjectLocked
    ? lockedProjectName
    : projects.find(p => p.id === selectedProjectId)?.name;

  // Auto-set vendor when service changes
  const handleServiceChange = (id) => {
    setServiceId(id);
    const svc = services.find(s => s.id === id);
    if (svc?.default_vendor_id) {
      setVendorId(svc.default_vendor_id);
    } else {
      setVendorId("");
    }
  };

  const handleCreateVendor = async () => {
    if (!newVendorName.trim()) return;
    setCreatingVendor(true);
    try {
      const res = await base44.functions.invoke("executeServiceAction", {
        action_type: "CREATE_SERVICE_VENDOR",
        name: newVendorName.trim(),
      });
      setVendorId(res.data.vendor.id);
      toast.success("Vendor created");
      setShowNewVendor(false);
      setNewVendorName("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleSave = async () => {
    if (!resolvedProjectId) {
      toast.error("Please select a project");
      return;
    }
    if (!serviceId || !description) {
      toast.error("Service and description are required");
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke("executeServiceAction", {
        action_type: "CREATE",
        project_id: resolvedProjectId,
        service_id: serviceId,
        description,
        vendor_id: vendorId || selectedService?.default_vendor_id || null,
        estimated_cost: parseFloat(estimatedCost) || 0,
        quantity: parseInt(quantity) || 1,
        notes,
      });
      toast.success("Service added to project");
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
          <DialogTitle className="text-white">Create Service for Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto">
          {/* ── Section 1: Project Association ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <Label className="text-gray-300 font-medium">Project *</Label>
            </div>
            {isProjectLocked ? (
              <div className="bg-gray-800/70 border border-gray-700 rounded-md px-3 py-2 flex items-center gap-2">
                <Badge variant="outline" className="border-blue-600/50 text-blue-400 text-xs">Locked</Badge>
                <span className="text-white text-sm">{lockedProjectName || "Project"}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Search projects..."
                    value={projectSearch}
                    onChange={e => setProjectSearch(e.target.value)}
                    className="pl-10 bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto border border-gray-700 rounded-md bg-gray-900/50">
                  {filteredProjects.length === 0 ? (
                    <p className="text-xs text-gray-500 p-3 text-center">No projects found</p>
                  ) : (
                    filteredProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProjectId(p.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-gray-800 last:border-b-0 ${
                          selectedProjectId === p.id
                            ? "bg-blue-900/40 text-white"
                            : "text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        <span className="font-medium">{p.name}</span>
                        {p.client_name && <span className="text-gray-500 ml-2 text-xs">— {p.client_name}</span>}
                      </button>
                    ))
                  )}
                </div>
                {!selectedProjectId && (
                  <p className="text-xs text-amber-400">⚠ You must select a project before adding a service</p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ── Section 2: Service Selection ── */}
          <div>
            <Label className="text-gray-300">Service *</Label>
            <Select value={serviceId} onValueChange={handleServiceChange}>
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

          <div className="border-t border-gray-700/50" />

          {/* ── Section 3: Vendor Selection ── */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-gray-300">Service Vendor</Label>
              <Button variant="link" size="sm" className="text-xs text-blue-400 h-auto p-0" onClick={() => setShowNewVendor(!showNewVendor)}>
                {showNewVendor ? "Cancel" : "+ New Vendor"}
              </Button>
            </div>
            {showNewVendor ? (
              <div className="flex gap-2 mt-1">
                <Input
                  value={newVendorName}
                  onChange={e => setNewVendorName(e.target.value)}
                  placeholder="Vendor name..."
                  className="bg-gray-800 border-gray-600 text-white"
                />
                <Button size="sm" onClick={handleCreateVendor} disabled={creatingVendor || !newVendorName.trim()}>
                  {creatingVendor ? "..." : "Add"}
                </Button>
              </div>
            ) : (
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                  <SelectValue placeholder="Select vendor (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {filteredVendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ── Section 4: Cost & Quantity ── */}
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
          <Button onClick={handleSave} disabled={saving || !resolvedProjectId || !serviceId || !description}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}