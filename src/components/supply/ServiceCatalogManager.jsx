import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Edit2, Trash2, Truck, Users } from "lucide-react";
import { toast } from "sonner";
import useServiceVendorGroups from "@/components/supply/useServiceVendorGroups";

const CATEGORIES = [
  "shipping", "finishing", "coating", "plating", "fabrication",
  "upholstery", "electrical", "paint", "machine_work", "inspection", "other"
];

export default function ServiceCatalogManager() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("services");
  const [editModal, setEditModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editVendorModal, setEditVendorModal] = useState(null);
  const [deleteVendorConfirm, setDeleteVendorConfirm] = useState(null);

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog"],
    queryFn: () => base44.entities.Service.list(),
  });

  const { vendors: allActiveVendors, vendorGroups, groupsMap, vendorsByGroup } = useServiceVendorGroups();

  // Also fetch inactive vendors for admin view
  const { data: allServiceVendors = [] } = useQuery({
    queryKey: ["serviceVendors-all"],
    queryFn: () => base44.entities.ServiceVendor.list(),
  });

  const vendorsMap = useMemo(() => new Map(allServiceVendors.map(v => [v.id, v])), [allServiceVendors]);

  const invalidateServices = () => queryClient.invalidateQueries({ queryKey: ["services-catalog"] });
  const invalidateVendors = () => {
    queryClient.invalidateQueries({ queryKey: ["serviceVendors"] });
    queryClient.invalidateQueries({ queryKey: ["serviceVendors-all"] });
    queryClient.invalidateQueries({ queryKey: ["vendorGroups-service"] });
  };

  const handleDeleteService = async (id) => {
    try {
      await base44.entities.Service.delete(id);
      toast.success("Service deleted");
      invalidateServices();
      setDeleteConfirm(null);
    } catch (err) { toast.error(err.message); }
  };

  const handleDeleteVendor = async (id) => {
    try {
      await base44.entities.ServiceVendor.delete(id);
      toast.success("Vendor deleted");
      invalidateVendors();
      setDeleteVendorConfirm(null);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="bg-gray-800/50 border border-gray-700">
          <TabsTrigger value="services" className="data-[state=active]:bg-gray-700 gap-1 text-sm">
            <Truck className="w-3.5 h-3.5" /> Services
          </TabsTrigger>
          <TabsTrigger value="vendors" className="data-[state=active]:bg-gray-700 gap-1 text-sm">
            <Users className="w-3.5 h-3.5" /> Service Vendors
          </TabsTrigger>
        </TabsList>

        {/* Services Tab */}
        <TabsContent value="services" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Service Catalog</h2>
              <p className="text-xs text-gray-500">Define reusable service types</p>
            </div>
            <Button onClick={() => setEditModal("new")} size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> New Service
            </Button>
          </div>

          {services.length === 0 ? (
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-8 text-center">
                <Truck className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-400 text-sm">No services in catalog</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {services.map(s => {
                const allowedVendorNames = (s.allowed_vendor_ids || []).map(id => vendorsMap.get(id)?.name).filter(Boolean);
                return (
                  <Card key={s.id} className="bg-gray-800/50 border-gray-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">{s.name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400">{s.category || "other"}</Badge>
                            {!s.is_active && <Badge variant="outline" className="text-[10px] border-red-600 text-red-400">Inactive</Badge>}
                          </div>
                          {s.default_vendor_id && (
                            <p className="text-xs text-gray-500 mt-1">Default: {vendorsMap.get(s.default_vendor_id)?.name || "Unknown"}</p>
                          )}
                          {allowedVendorNames.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">Vendors: {allowedVendorNames.join(", ")}</p>
                          )}
                          {s.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditModal(s)}>
                            <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirm(s)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Service Vendors</h2>
              <p className="text-xs text-gray-500">Manage vendors for services (separate from parts vendors)</p>
            </div>
            <Button onClick={() => setEditVendorModal("new")} size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> New Vendor
            </Button>
          </div>

          {allServiceVendors.length === 0 ? (
            <Card className="bg-black/40 border-gray-800">
              <CardContent className="p-8 text-center">
                <Users className="w-10 h-10 mx-auto mb-3 text-gray-600" />
                <p className="text-gray-400 text-sm">No service vendors yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {vendorGroups.map(group => {
                const gVendors = allServiceVendors.filter(v => v.vendor_group_id === group.id);
                if (gVendors.length === 0) return null;
                return (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px] border-blue-600/50 text-blue-400">{group.name}</Badge>
                      <span className="text-[10px] text-gray-500">{gVendors.length} vendor{gVendors.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {gVendors.map(v => (
                        <VendorCard key={v.id} vendor={v} groupName={group.name} onEdit={() => setEditVendorModal(v)} onDelete={() => setDeleteVendorConfirm(v)} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* Ungrouped vendors */}
              {(() => {
                const ungrouped = allServiceVendors.filter(v => !v.vendor_group_id || !groupsMap.has(v.vendor_group_id));
                if (ungrouped.length === 0) return null;
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400">Ungrouped</Badge>
                      <span className="text-[10px] text-gray-500">{ungrouped.length} vendor{ungrouped.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {ungrouped.map(v => (
                        <VendorCard key={v.id} vendor={v} onEdit={() => setEditVendorModal(v)} onDelete={() => setDeleteVendorConfirm(v)} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Service Edit Modal */}
      {editModal && (
        <ServiceEditModal
          service={editModal === "new" ? null : editModal}
          serviceVendors={allServiceVendors}
          vendorGroups={vendorGroups}
          groupsMap={groupsMap}
          onClose={() => setEditModal(null)}
          onSuccess={() => { invalidateServices(); setEditModal(null); }}
        />
      )}

      {/* Service Delete Confirm */}
      {deleteConfirm && (
        <Dialog open onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
            <DialogHeader><DialogTitle className="text-white">Delete Service?</DialogTitle></DialogHeader>
            <p className="text-sm text-gray-400">Delete "{deleteConfirm.name}"? Existing commitments won't be affected.</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-gray-600">Cancel</Button>
              <Button variant="destructive" onClick={() => handleDeleteService(deleteConfirm.id)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Vendor Edit Modal */}
      {editVendorModal && (
        <VendorEditModal
          vendor={editVendorModal === "new" ? null : editVendorModal}
          vendorGroups={vendorGroups}
          onClose={() => setEditVendorModal(null)}
          onSuccess={() => { invalidateVendors(); setEditVendorModal(null); }}
        />
      )}

      {/* Vendor Delete Confirm */}
      {deleteVendorConfirm && (
        <Dialog open onOpenChange={() => setDeleteVendorConfirm(null)}>
          <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
            <DialogHeader><DialogTitle className="text-white">Delete Vendor?</DialogTitle></DialogHeader>
            <p className="text-sm text-gray-400">Delete "{deleteVendorConfirm.name}"?</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteVendorConfirm(null)} className="border-gray-600">Cancel</Button>
              <Button variant="destructive" onClick={() => handleDeleteVendor(deleteVendorConfirm.id)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── SERVICE EDIT MODAL ──
function ServiceEditModal({ service, serviceVendors, vendorGroups, groupsMap, onClose, onSuccess }) {
  const isNew = !service;
  const [name, setName] = useState(service?.name || "");
  const [category, setCategory] = useState(service?.category || "other");
  const [description, setDescription] = useState(service?.description || "");
  const [defaultVendorId, setDefaultVendorId] = useState(service?.default_vendor_id || "");
  const [allowedVendorIds, setAllowedVendorIds] = useState(service?.allowed_vendor_ids || []);
  const [preferredGroupId, setPreferredGroupId] = useState(service?.preferred_vendor_group_id || "");
  const [isActive, setIsActive] = useState(service?.is_active !== false);
  const [saving, setSaving] = useState(false);

  const toggleVendor = (id) => {
    setAllowedVendorIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        category,
        preferred_vendor_group_id: preferredGroupId || null,
        description: description.trim() || null,
        default_vendor_id: defaultVendorId || null,
        allowed_vendor_ids: allowedVendorIds,
        is_active: isActive,
      };
      if (isNew) {
        await base44.entities.Service.create(data);
        toast.success("Service created");
      } else {
        await base44.entities.Service.update(service.id, data);
        toast.success("Service updated");
      }
      onSuccess();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader><DialogTitle className="text-white">{isNew ? "New Service" : "Edit Service"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-gray-300">Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Preferred Vendor Group</Label>
            <Select value={preferredGroupId || "__none__"} onValueChange={v => setPreferredGroupId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1"><SelectValue placeholder="Auto-match by category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Auto-match by category</SelectItem>
                {(vendorGroups || []).map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-500 mt-1">Links this service to a vendor group for smart filtering</p>
          </div>
          <div>
            <Label className="text-gray-300">Default Vendor</Label>
            <Select value={defaultVendorId} onValueChange={setDefaultVendorId}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>None</SelectItem>
                {serviceVendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Allowed Vendors</Label>
            <div className="mt-1 space-y-1 max-h-32 overflow-y-auto border border-gray-700 rounded p-2">
              {serviceVendors.length === 0 ? (
                <p className="text-xs text-gray-500">No service vendors created yet</p>
              ) : serviceVendors.map(v => (
                <label key={v.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={allowedVendorIds.includes(v.id)} onChange={() => toggleVendor(v.id)} className="rounded" />
                  {v.name}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">Leave empty to allow all vendors</p>
          </div>
          <div>
            <Label className="text-gray-300">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional..." className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
            Active
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Saving..." : isNew ? "Create" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── VENDOR CARD ──
function VendorCard({ vendor, groupName, onEdit, onDelete }) {
  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-white">{vendor.name}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {groupName && <Badge variant="outline" className="text-[10px] border-blue-600/40 text-blue-400">{groupName}</Badge>}
              <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400">{vendor.category || "general"}</Badge>
              {!vendor.is_active && <Badge variant="outline" className="text-[10px] border-red-600 text-red-400">Inactive</Badge>}
            </div>
            {vendor.contact_name && <p className="text-xs text-gray-500 mt-1">{vendor.contact_name}</p>}
            {vendor.contact_email && <p className="text-xs text-gray-500">{vendor.contact_email}</p>}
            {vendor.contact_phone && <p className="text-xs text-gray-500">{vendor.contact_phone}</p>}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── VENDOR EDIT MODAL ──
function VendorEditModal({ vendor, vendorGroups, onClose, onSuccess }) {
  const isNew = !vendor;
  const [name, setName] = useState(vendor?.name || "");
  const [category, setCategory] = useState(vendor?.category || "general");
  const [contactName, setContactName] = useState(vendor?.contact_name || "");
  const [contactEmail, setContactEmail] = useState(vendor?.contact_email || "");
  const [contactPhone, setContactPhone] = useState(vendor?.contact_phone || "");
  const [vendorGroupId, setVendorGroupId] = useState(vendor?.vendor_group_id || "");
  const [notes, setNotes] = useState(vendor?.notes || "");
  const [isActive, setIsActive] = useState(vendor?.is_active !== false);
  const [saving, setSaving] = useState(false);

  const VENDOR_CATS = ["shipping", "finishing", "coating", "plating", "fabrication", "upholstery", "electrical", "paint", "machine_work", "inspection", "general", "other"];

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(), category,
        vendor_group_id: vendorGroupId || null,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        notes: notes.trim() || null,
        is_active: isActive,
      };
      if (isNew) {
        await base44.entities.ServiceVendor.create(data);
        toast.success("Vendor created");
      } else {
        await base44.entities.ServiceVendor.update(vendor.id, data);
        toast.success("Vendor updated");
      }
      onSuccess();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader><DialogTitle className="text-white">{isNew ? "New Service Vendor" : "Edit Service Vendor"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-gray-300">Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300">Vendor Group</Label>
            <Select value={vendorGroupId || "__none__"} onValueChange={v => setVendorGroupId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1"><SelectValue placeholder="Select group..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {(vendorGroups || []).map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Category (legacy)</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENDOR_CATS.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-300">Contact Name</Label>
            <Input value={contactName} onChange={e => setContactName(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-gray-300">Email</Label>
              <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300">Phone</Label>
              <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-gray-300">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional..." className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
            Active
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Saving..." : isNew ? "Create" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}