import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, Layers } from "lucide-react";
import { toast } from "sonner";

export default function ServiceCatalogConfig() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services-catalog-admin"],
    queryFn: () => base44.entities.Service.list(),
  });

  const { data: vendorGroups = [] } = useQuery({
    queryKey: ["vendorGroups-service"],
    queryFn: async () => {
      const all = await base44.entities.VendorGroup.filter({ vendor_type: "SERVICE", is_active: true });
      return all.sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));
    },
  });

  const groupsMap = new Map(vendorGroups.map(g => [g.id, g]));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["services-catalog-admin"] });
    queryClient.invalidateQueries({ queryKey: ["services-catalog"] });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) { toast.error("Name required"); return; }
    if (!newGroupId) { toast.error("Vendor Group required"); return; }
    setCreating(true);
    try {
      await base44.entities.Service.create({
        name: newName.trim(),
        preferred_vendor_group_id: newGroupId,
        description: newDescription.trim() || null,
        is_active: true,
      });
      toast.success("Service created");
      setNewName("");
      setNewGroupId("");
      setNewDescription("");
      invalidate();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (svc) => {
    setEditingId(svc.id);
    setEditData({
      name: svc.name || "",
      preferred_vendor_group_id: svc.preferred_vendor_group_id || "",
      description: svc.description || "",
      is_active: svc.is_active !== false,
    });
  };

  const saveEdit = async () => {
    if (!editData.name.trim()) { toast.error("Name required"); return; }
    if (!editData.preferred_vendor_group_id) { toast.error("Vendor Group required"); return; }
    try {
      await base44.entities.Service.update(editingId, editData);
      toast.success("Service updated");
      setEditingId(null);
      setEditData(null);
      invalidate();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleActive = async (svc) => {
    await base44.entities.Service.update(svc.id, { is_active: !svc.is_active });
    invalidate();
  };

  const handleDelete = async (svc) => {
    if (!confirm(`Delete service "${svc.name}"?`)) return;
    await base44.entities.Service.delete(svc.id);
    toast.success("Deleted");
    invalidate();
  };

  const active = services.filter(s => s.is_active !== false);
  const inactive = services.filter(s => s.is_active === false);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Layers className="w-5 h-5 text-purple-400" />
          Service Catalog
        </CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Manage service types. Each service must be assigned to a Vendor Group.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* Create Form */}
        <form onSubmit={handleCreate} className="space-y-3 p-4 bg-gray-900/50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Service Name *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Chrome Plating" className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Vendor Group *</Label>
              <Select value={newGroupId} onValueChange={setNewGroupId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select group..." />
                </SelectTrigger>
                <SelectContent>
                  {vendorGroups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Description</Label>
              <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional..." className="bg-gray-800 border-gray-700 text-white" />
            </div>
          </div>
          <Button type="submit" disabled={creating} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Service
          </Button>
        </form>

        {vendorGroups.length === 0 && (
          <div className="text-center py-4 text-amber-400 text-sm bg-amber-900/20 border border-amber-700/40 rounded-lg">
            No vendor groups found. Create vendor groups first in the "Vendor Groups" tab.
          </div>
        )}

        {/* Active Services */}
        <div>
          <Label className="text-gray-400 text-xs mb-3 block">Active Services ({active.length})</Label>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : active.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No services yet</div>
          ) : (
            <div className="space-y-2">
              {active.map(svc => (
                <ServiceRow
                  key={svc.id}
                  svc={svc}
                  groupsMap={groupsMap}
                  vendorGroups={vendorGroups}
                  isEditing={editingId === svc.id}
                  editData={editData}
                  onEditDataChange={setEditData}
                  onStartEdit={() => startEdit(svc)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => { setEditingId(null); setEditData(null); }}
                  onToggleActive={() => toggleActive(svc)}
                  onDelete={() => handleDelete(svc)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Inactive */}
        {inactive.length > 0 && (
          <div>
            <Label className="text-gray-400 text-xs mb-3 block">Inactive Services ({inactive.length})</Label>
            <div className="space-y-2 opacity-60">
              {inactive.map(svc => (
                <ServiceRow
                  key={svc.id}
                  svc={svc}
                  groupsMap={groupsMap}
                  vendorGroups={vendorGroups}
                  isEditing={editingId === svc.id}
                  editData={editData}
                  onEditDataChange={setEditData}
                  onStartEdit={() => startEdit(svc)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => { setEditingId(null); setEditData(null); }}
                  onToggleActive={() => toggleActive(svc)}
                  onDelete={() => handleDelete(svc)}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceRow({ svc, groupsMap, vendorGroups, isEditing, editData, onEditDataChange, onStartEdit, onSaveEdit, onCancelEdit, onToggleActive, onDelete }) {
  const group = groupsMap.get(svc.preferred_vendor_group_id);

  if (isEditing && editData) {
    return (
      <div className="p-3 bg-gray-900/70 rounded-lg border border-gray-700 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-gray-400 text-xs">Name *</Label>
            <Input value={editData.name} onChange={e => onEditDataChange({ ...editData, name: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Vendor Group *</Label>
            <Select value={editData.preferred_vendor_group_id} onValueChange={v => onEditDataChange({ ...editData, preferred_vendor_group_id: v })}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Select group..." /></SelectTrigger>
              <SelectContent>
                {vendorGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Description</Label>
            <Input value={editData.description} onChange={e => onEditDataChange({ ...editData, description: e.target.value })} className="bg-gray-800 border-gray-700 text-white" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onSaveEdit} className="gap-1"><Check className="w-3.5 h-3.5" /> Save</Button>
          <Button size="sm" variant="outline" onClick={onCancelEdit} className="gap-1"><XIcon className="w-3.5 h-3.5" /> Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-white">{svc.name}</span>
          {group ? (
            <Badge variant="outline" className="text-[10px] border-purple-600/50 text-purple-400">{group.name}</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] border-red-600/50 text-red-400">No Group!</Badge>
          )}
          {svc.is_active === false && (
            <Badge variant="outline" className="text-[10px] bg-gray-800 text-gray-500 border-gray-700">Inactive</Badge>
          )}
        </div>
        {svc.description && <p className="text-xs text-gray-500 mt-0.5">{svc.description}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={onToggleActive} className="h-8 w-8 text-gray-400" title={svc.is_active !== false ? "Deactivate" : "Activate"}>
          <span className="text-xs">{svc.is_active !== false ? "✓" : "○"}</span>
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