import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, Truck, Globe, Phone, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { buildHierarchicalOptions } from "@/components/supply/vendorGroupHierarchy";

const EMPTY_FORM = {
  name: "",
  vendor_group_id: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  cell_phone: "",
  address: "",
  website: "",
  notes: "",
};

export default function ServiceVendorsConfig() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null); // null = create, object = edit

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["serviceVendors-admin"],
    queryFn: () => base44.entities.ServiceVendor.list(),
  });

  const { data: vendorGroups = [] } = useQuery({
    queryKey: ["vendorGroups-service"],
    queryFn: async () => {
      const all = await base44.entities.VendorGroup.filter({ vendor_type: "SERVICE", is_active: true });
      return all.sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));
    },
  });
  const groupsMap = new Map(vendorGroups.map(g => [g.id, g]));

  // Build hierarchy label map for display
  const hierarchicalLabels = useMemo(() => {
    const opts = buildHierarchicalOptions(vendorGroups, "SERVICE");
    const map = new Map();
    for (const o of opts) map.set(o.id, o.label);
    return map;
  }, [vendorGroups]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["serviceVendors-admin"] });
    queryClient.invalidateQueries({ queryKey: ["serviceVendors"] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceVendor.delete(id),
    onSuccess: () => { invalidateAll(); toast.success("Service vendor deleted"); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.ServiceVendor.update(id, { is_active }),
    onSuccess: () => { invalidateAll(); },
  });

  const openCreate = () => { setEditingVendor(null); setModalOpen(true); };
  const openEdit = (vendor) => { setEditingVendor(vendor); setModalOpen(true); };

  const activeVendors = vendors.filter(v => v.is_active !== false);
  const inactiveVendors = vendors.filter(v => v.is_active === false);

  // Group vendors by vendor_group_id for organized display
  const vendorsByGroup = useMemo(() => {
    const map = new Map();
    const ungrouped = [];
    for (const v of activeVendors) {
      if (v.vendor_group_id && groupsMap.has(v.vendor_group_id)) {
        if (!map.has(v.vendor_group_id)) map.set(v.vendor_group_id, []);
        map.get(v.vendor_group_id).push(v);
      } else {
        ungrouped.push(v);
      }
    }
    return { grouped: map, ungrouped };
  }, [activeVendors, groupsMap]);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-400" />
              Service Vendors
            </CardTitle>
            <p className="text-sm text-gray-400 mt-1">
              Vendors are organized by Vendor Group. Each vendor belongs to exactly one group.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Service Vendor
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : activeVendors.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No service vendors yet</p>
            <Button variant="outline" size="sm" onClick={openCreate} className="mt-3 gap-1">
              <Plus className="w-3.5 h-3.5" /> Create First Vendor
            </Button>
          </div>
        ) : (
          <>
            {/* Grouped display */}
            {vendorGroups.map(group => {
              const groupVendors = vendorsByGroup.grouped.get(group.id) || [];
              if (groupVendors.length === 0) return null;
              return (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] border-purple-600/50 text-purple-400">{hierarchicalLabels.get(group.id) || group.name}</Badge>
                    <span className="text-[10px] text-gray-500">{groupVendors.length} vendor{groupVendors.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="space-y-2">
                    {groupVendors.map(vendor => (
                      <VendorRow
                        key={vendor.id}
                        vendor={vendor}
                        group={group}
                        onEdit={() => openEdit(vendor)}
                        onToggleActive={() => toggleActiveMutation.mutate({ id: vendor.id, is_active: false })}
                        onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Ungrouped vendors (data integrity issue) */}
            {vendorsByGroup.ungrouped.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] border-red-600/50 text-red-400">No Group Assigned</Badge>
                  <span className="text-[10px] text-gray-500">{vendorsByGroup.ungrouped.length} vendor{vendorsByGroup.ungrouped.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2">
                  {vendorsByGroup.ungrouped.map(vendor => (
                    <VendorRow
                      key={vendor.id}
                      vendor={vendor}
                      group={null}
                      onEdit={() => openEdit(vendor)}
                      onToggleActive={() => toggleActiveMutation.mutate({ id: vendor.id, is_active: false })}
                      onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Inactive Vendors */}
        {inactiveVendors.length > 0 && (
          <div>
            <Label className="text-gray-400 text-xs mb-3 block">
              Inactive Vendors ({inactiveVendors.length})
            </Label>
            <div className="space-y-2 opacity-60">
              {inactiveVendors.map(vendor => (
                <VendorRow
                  key={vendor.id}
                  vendor={vendor}
                  group={groupsMap.get(vendor.vendor_group_id) || null}
                  onEdit={() => openEdit(vendor)}
                  onToggleActive={() => toggleActiveMutation.mutate({ id: vendor.id, is_active: true })}
                  onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                  isInactive
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <AdminServiceVendorModal
          vendor={editingVendor}
          vendorGroups={vendorGroups}
          onClose={() => { setModalOpen(false); setEditingVendor(null); }}
          onSuccess={() => { invalidateAll(); setModalOpen(false); setEditingVendor(null); }}
        />
      )}
    </Card>
  );
}

/** Modal for creating/editing service vendors */
function AdminServiceVendorModal({ vendor, vendorGroups, onClose, onSuccess }) {
  const isNew = !vendor;
  const [form, setForm] = useState(isNew ? { ...EMPTY_FORM } : {
    name: vendor.name || "",
    vendor_group_id: vendor.vendor_group_id || "",
    contact_name: vendor.contact_name || "",
    contact_email: vendor.contact_email || "",
    contact_phone: vendor.contact_phone || "",
    cell_phone: vendor.cell_phone || "",
    address: vendor.address || "",
    website: vendor.website || "",
    notes: vendor.notes || "",
  });
  const [saving, setSaving] = useState(false);

  // Build hierarchical options for group dropdown
  const hierarchicalOptions = useMemo(
    () => buildHierarchicalOptions(vendorGroups, "SERVICE"),
    [vendorGroups]
  );

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (!form.vendor_group_id) { toast.error("Vendor Group required"); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        vendor_group_id: form.vendor_group_id,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        cell_phone: form.cell_phone.trim() || null,
        address: form.address.trim() || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (isNew) {
        await base44.entities.ServiceVendor.create({ ...data, is_active: true });
        toast.success(`Vendor "${data.name}" created`);
      } else {
        await base44.entities.ServiceVendor.update(vendor.id, data);
        toast.success(`Vendor "${data.name}" updated`);
      }
      onSuccess();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{isNew ? "Add Service Vendor" : "Edit Service Vendor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[65vh] overflow-y-auto">
          <div>
            <Label className="text-gray-300 text-xs">Vendor Name *</Label>
            <Input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="e.g., Chrome Plating Co." className="bg-gray-800 border-gray-600 text-white mt-1" autoFocus />
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Vendor Group *</Label>
            <Select value={form.vendor_group_id} onValueChange={v => updateField("vendor_group_id", v)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white mt-1">
                <SelectValue placeholder="Select group..." />
              </SelectTrigger>
              <SelectContent>
                {hierarchicalOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.depth > 0 ? `${"  ".repeat(opt.depth)}↳ ${opt.name}` : opt.name}
                    {opt.depth > 0 ? ` (${opt.label})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 text-xs">Contact Name</Label>
              <Input value={form.contact_name} onChange={e => updateField("contact_name", e.target.value)} placeholder="Primary contact" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Contact Email</Label>
              <Input type="email" value={form.contact_email} onChange={e => updateField("contact_email", e.target.value)} placeholder="email@vendor.com" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Contact Phone</Label>
              <Input value={form.contact_phone} onChange={e => updateField("contact_phone", e.target.value)} placeholder="(555) 123-4567" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Cell Phone</Label>
              <Input value={form.cell_phone} onChange={e => updateField("cell_phone", e.target.value)} placeholder="(555) 987-6543" className="bg-gray-800 border-gray-600 text-white mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Address</Label>
            <Input value={form.address} onChange={e => updateField("address", e.target.value)} placeholder="Vendor address" className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Website</Label>
            <Input value={form.website} onChange={e => updateField("website", e.target.value)} placeholder="https://vendor.com" className="bg-gray-800 border-gray-600 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-300 text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => updateField("notes", e.target.value)} placeholder="Additional notes..." className="bg-gray-800 border-gray-600 text-white mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.vendor_group_id}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {saving ? "Saving..." : isNew ? "Create Vendor" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact vendor row display */
function VendorRow({ vendor, group, onEdit, onToggleActive, onDelete, isInactive = false }) {
  return (
    <div className="p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-white">{vendor.name}</span>
          {!group && (
            <Badge variant="outline" className="text-[10px] border-red-600/50 text-red-400">No Group!</Badge>
          )}
          {isInactive && (
            <Badge variant="outline" className="text-[10px] bg-gray-800 text-gray-500 border-gray-700">Inactive</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-sm text-gray-400">
          {vendor.contact_name && <span>{vendor.contact_name}</span>}
          {vendor.contact_email && <span>{vendor.contact_email}</span>}
          {vendor.contact_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.contact_phone}</span>}
          {vendor.cell_phone && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" />{vendor.cell_phone}</span>}
        </div>
        {vendor.address && <p className="text-xs text-gray-500 mt-0.5">{vendor.address}</p>}
        {vendor.website && (
          <a href={vendor.website.startsWith("http") ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-0.5 flex items-center gap-1">
            <Globe className="w-3 h-3" />{vendor.website}
          </a>
        )}
        {vendor.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{vendor.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={onToggleActive} className="h-8 w-8 text-gray-400" title={isInactive ? "Activate" : "Deactivate"}>
          <span className="text-xs">{isInactive ? "○" : "✓"}</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={onEdit} className="h-8 w-8 text-blue-400">
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} className="h-8 w-8 text-red-400">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}