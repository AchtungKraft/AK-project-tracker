import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, Truck, Globe, Phone, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

const CATEGORY_OPTIONS = [
  { value: "shipping", label: "Shipping" },
  { value: "finishing", label: "Finishing" },
  { value: "coating", label: "Coating" },
  { value: "plating", label: "Plating" },
  { value: "fabrication", label: "Fabrication" },
  { value: "upholstery", label: "Upholstery" },
  { value: "electrical", label: "Electrical" },
  { value: "paint", label: "Paint" },
  { value: "machine_work", label: "Machine Work" },
  { value: "inspection", label: "Inspection" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS = {
  shipping: "bg-blue-900/50 text-blue-400 border-blue-700/50",
  finishing: "bg-amber-900/50 text-amber-400 border-amber-700/50",
  coating: "bg-emerald-900/50 text-emerald-400 border-emerald-700/50",
  plating: "bg-purple-900/50 text-purple-400 border-purple-700/50",
  fabrication: "bg-orange-900/50 text-orange-400 border-orange-700/50",
  upholstery: "bg-pink-900/50 text-pink-400 border-pink-700/50",
  electrical: "bg-cyan-900/50 text-cyan-400 border-cyan-700/50",
  paint: "bg-red-900/50 text-red-400 border-red-700/50",
  machine_work: "bg-gray-800/50 text-gray-300 border-gray-600/50",
  inspection: "bg-indigo-900/50 text-indigo-400 border-indigo-700/50",
  general: "bg-gray-800/50 text-gray-400 border-gray-700/50",
  other: "bg-gray-800/50 text-gray-400 border-gray-700/50",
};

const EMPTY_FORM = {
  name: "",
  category: "general",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  cell_phone: "",
  address: "",
  website: "",
  associated_service_ids: [],
  notes: "",
};

export default function ServiceVendorsConfig() {
  const queryClient = useQueryClient();
  const [newVendor, setNewVendor] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["serviceVendors-admin"],
    queryFn: () => base44.entities.ServiceVendor.list(),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-catalog-admin"],
    queryFn: () => base44.entities.Service.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ServiceVendor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceVendors-admin"] });
      queryClient.invalidateQueries({ queryKey: ["serviceVendors"] });
      setNewVendor({ ...EMPTY_FORM });
      toast.success("Service vendor created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ServiceVendor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceVendors-admin"] });
      queryClient.invalidateQueries({ queryKey: ["serviceVendors"] });
      setEditingId(null);
      setEditData(null);
      toast.success("Service vendor updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceVendor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceVendors-admin"] });
      queryClient.invalidateQueries({ queryKey: ["serviceVendors"] });
      toast.success("Service vendor deleted");
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newVendor.name.trim()) return;
    createMutation.mutate({ ...newVendor, is_active: true });
  };

  const startEdit = (vendor) => {
    setEditingId(vendor.id);
    setEditData({
      name: vendor.name || "",
      category: vendor.category || "general",
      contact_name: vendor.contact_name || "",
      contact_email: vendor.contact_email || "",
      contact_phone: vendor.contact_phone || "",
      cell_phone: vendor.cell_phone || "",
      address: vendor.address || "",
      website: vendor.website || "",
      associated_service_ids: vendor.associated_service_ids || [],
      notes: vendor.notes || "",
    });
  };

  const saveEdit = () => {
    if (!editData.name.trim()) return;
    updateMutation.mutate({ id: editingId, data: editData });
  };

  const toggleActive = (vendor) => {
    updateMutation.mutate({ id: vendor.id, data: { is_active: !vendor.is_active } });
  };

  const activeVendors = vendors.filter(v => v.is_active !== false);
  const inactiveVendors = vendors.filter(v => v.is_active === false);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Truck className="w-5 h-5 text-amber-400" />
          Service Vendors
        </CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Manage vendors for services like shipping, plating, coating, and other non-parts work
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* Create Form */}
        <form onSubmit={handleCreate} className="space-y-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Vendor Name *</Label>
              <Input
                value={newVendor.name}
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                placeholder="e.g., UPS, Chrome Plating Co."
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Category</Label>
              <Select value={newVendor.category} onValueChange={(v) => setNewVendor({ ...newVendor, category: v })}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Contact Name</Label>
              <Input
                value={newVendor.contact_name}
                onChange={(e) => setNewVendor({ ...newVendor, contact_name: e.target.value })}
                placeholder="Primary contact"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Contact Email</Label>
              <Input
                type="email"
                value={newVendor.contact_email}
                onChange={(e) => setNewVendor({ ...newVendor, contact_email: e.target.value })}
                placeholder="email@vendor.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Contact Phone</Label>
              <Input
                value={newVendor.contact_phone}
                onChange={(e) => setNewVendor({ ...newVendor, contact_phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Cell Phone</Label>
              <Input
                value={newVendor.cell_phone}
                onChange={(e) => setNewVendor({ ...newVendor, cell_phone: e.target.value })}
                placeholder="(555) 987-6543"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Address</Label>
              <Input
                value={newVendor.address}
                onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                placeholder="Vendor address"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Website</Label>
              <Input
                value={newVendor.website}
                onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                placeholder="https://vendor.com"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            {services.length > 0 && (
              <div className="md:col-span-2">
                <Label className="text-gray-400 text-xs mb-2 block">Associated Services</Label>
                <div className="flex flex-wrap gap-3">
                  {services.filter(s => s.is_active !== false).map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <Checkbox
                        checked={newVendor.associated_service_ids?.includes(s.id)}
                        onCheckedChange={(checked) => {
                          const ids = newVendor.associated_service_ids || [];
                          setNewVendor({ ...newVendor, associated_service_ids: checked ? [...ids, s.id] : ids.filter(id => id !== s.id) });
                        }}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs">Notes</Label>
              <Textarea
                value={newVendor.notes}
                onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                placeholder="Additional notes about this vendor..."
                className="bg-gray-800 border-gray-700 text-white"
                rows={2}
              />
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="gap-2">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Plus className="w-4 h-4" />Add Service Vendor</>}
          </Button>
        </form>

        {/* Vendor List */}
        <div>
          <Label className="text-gray-400 text-xs mb-3 block">
            Active Vendors ({activeVendors.length})
          </Label>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : activeVendors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No service vendors yet</div>
          ) : (
            <div className="space-y-2">
              {activeVendors.map(vendor => (
                <VendorRow
                  key={vendor.id}
                  vendor={vendor}
                  services={services}
                  isEditing={editingId === vendor.id}
                  editData={editData}
                  onEditDataChange={setEditData}
                  onStartEdit={() => startEdit(vendor)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => { setEditingId(null); setEditData(null); }}
                  onToggleActive={() => toggleActive(vendor)}
                  onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                  isSaving={updateMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>

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
                  services={services}
                  isEditing={editingId === vendor.id}
                  editData={editData}
                  onEditDataChange={setEditData}
                  onStartEdit={() => startEdit(vendor)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => { setEditingId(null); setEditData(null); }}
                  onToggleActive={() => toggleActive(vendor)}
                  onDelete={() => { if (confirm("Delete this service vendor?")) deleteMutation.mutate(vendor.id); }}
                  isSaving={updateMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VendorRow({ vendor, services = [], isEditing, editData, onEditDataChange, onStartEdit, onSaveEdit, onCancelEdit, onToggleActive, onDelete, isSaving }) {
  const servicesMap = new Map(services.map(s => [s.id, s]));
  const catLabel = CATEGORY_OPTIONS.find(c => c.value === vendor.category)?.label || vendor.category || "General";
  const catColor = CATEGORY_COLORS[vendor.category] || CATEGORY_COLORS.general;

  if (isEditing && editData) {
    return (
      <div className="p-4 bg-gray-900/70 rounded-lg border border-gray-700 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-gray-400 text-xs">Name *</Label>
            <Input value={editData.name} onChange={e => onEditDataChange({ ...editData, name: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Category</Label>
            <Select value={editData.category} onValueChange={v => onEditDataChange({ ...editData, category: v })}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Contact Name</Label>
            <Input value={editData.contact_name} onChange={e => onEditDataChange({ ...editData, contact_name: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Contact Email</Label>
            <Input value={editData.contact_email} onChange={e => onEditDataChange({ ...editData, contact_email: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Contact Phone</Label>
            <Input value={editData.contact_phone} onChange={e => onEditDataChange({ ...editData, contact_phone: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Cell Phone</Label>
            <Input value={editData.cell_phone} onChange={e => onEditDataChange({ ...editData, cell_phone: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Address</Label>
            <Input value={editData.address} onChange={e => onEditDataChange({ ...editData, address: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Website</Label>
            <Input value={editData.website} onChange={e => onEditDataChange({ ...editData, website: e.target.value })} placeholder="https://" className="bg-gray-800 border-gray-700 text-white" />
          </div>
          {services.length > 0 && (
            <div className="md:col-span-2">
              <Label className="text-gray-400 text-xs mb-2 block">Associated Services</Label>
              <div className="flex flex-wrap gap-3">
                {services.filter(s => s.is_active !== false).map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <Checkbox
                      checked={editData.associated_service_ids?.includes(s.id)}
                      onCheckedChange={(checked) => {
                        const ids = editData.associated_service_ids || [];
                        onEditDataChange({ ...editData, associated_service_ids: checked ? [...ids, s.id] : ids.filter(id => id !== s.id) });
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="md:col-span-2">
            <Label className="text-gray-400 text-xs">Notes</Label>
            <Textarea value={editData.notes} onChange={e => onEditDataChange({ ...editData, notes: e.target.value })} className="bg-gray-800 border-gray-700 text-white" rows={2} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onSaveEdit} disabled={isSaving} className="gap-1">
            <Check className="w-3.5 h-3.5" /> Save
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelEdit} className="gap-1">
            <XIcon className="w-3.5 h-3.5" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-white">{vendor.name}</span>
          <Badge variant="outline" className={`text-[10px] ${catColor}`}>{catLabel}</Badge>
          {vendor.is_active === false && (
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
          <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-0.5 flex items-center gap-1">
            <Globe className="w-3 h-3" />{vendor.website}
          </a>
        )}
        {vendor.associated_service_ids?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {vendor.associated_service_ids.map(sid => {
              const svc = servicesMap.get(sid);
              return svc ? <Badge key={sid} variant="outline" className="text-[10px] bg-amber-900/30 text-amber-400 border-amber-700/40">{svc.name}</Badge> : null;
            })}
          </div>
        )}
        {vendor.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{vendor.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={onToggleActive} className="h-8 w-8 text-gray-400" title={vendor.is_active !== false ? "Deactivate" : "Activate"}>
          <span className="text-xs">{vendor.is_active !== false ? "✓" : "○"}</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={onStartEdit} className="h-8 w-8 text-blue-400">
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} className="h-8 w-8 text-red-400">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}