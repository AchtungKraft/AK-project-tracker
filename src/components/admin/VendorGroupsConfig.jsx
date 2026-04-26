import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, Package, Truck, ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import UnclassifiedVendorsPanel from "./UnclassifiedVendorsPanel";

const TYPE_CONFIG = {
  PART: { label: "Part Vendors", icon: Package, color: "text-blue-400", bg: "bg-blue-900/30 border-blue-700/40" },
  SERVICE: { label: "Service Vendors", icon: Truck, color: "text-amber-400", bg: "bg-amber-900/30 border-amber-700/40" },
};

const LINE_ITEM_TYPE_OPTIONS = [
  { value: "vendor_cost", label: "Vendor Cost" },
  { value: "shipping", label: "Shipping" },
  { value: "internal_labor", label: "Internal Labor" },
  { value: "misc", label: "Misc" },
];

export default function VendorGroupsConfig() {
  const queryClient = useQueryClient();
  const [newGroup, setNewGroup] = useState({ name: "", vendor_type: "PART", sort_priority: 0, default_line_item_type: "vendor_cost", parent_group_id: "" });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["referenceData", "vendorGroups"],
    queryFn: () => base44.entities.VendorGroup.list(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["referenceData", "vendorGroups"] });
    queryClient.invalidateQueries({ queryKey: ["vendorGroups-service"] });
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.VendorGroup.create(data),
    onSuccess: () => {
      invalidateAll();
      setNewGroup({ name: "", vendor_type: "PART", sort_priority: 0, default_line_item_type: "vendor_cost", parent_group_id: "" });
      toast.success("Group created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.VendorGroup.update(id, data),
    onSuccess: () => {
      invalidateAll();
      setEditingId(null);
      setEditData(null);
      toast.success("Group updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VendorGroup.delete(id),
    onSuccess: () => {
      invalidateAll();
      toast.success("Group deleted");
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newGroup.name.trim()) return;
    const payload = { ...newGroup, is_active: true };
    if (!payload.parent_group_id) delete payload.parent_group_id;
    createMutation.mutate(payload);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await base44.functions.invoke("seedVendorGroups", {});
      toast.success(`Seeded ${res.data.created} groups (${res.data.skipped} already existed)`);
      invalidateAll();
    } catch (err) {
      toast.error("Seed failed: " + (err.message || "Unknown error"));
    }
    setSeeding(false);
  };

  // Build hierarchical trees per type
  const { partTree, serviceTree } = useMemo(() => {
    const buildTree = (type) => {
      const typed = groups.filter(g => g.vendor_type === type);
      const byId = new Map(typed.map(g => [g.id, g]));
      const roots = typed.filter(g => !g.parent_group_id || !byId.has(g.parent_group_id));
      const childrenOf = new Map();
      for (const g of typed) {
        if (g.parent_group_id && byId.has(g.parent_group_id)) {
          if (!childrenOf.has(g.parent_group_id)) childrenOf.set(g.parent_group_id, []);
          childrenOf.get(g.parent_group_id).push(g);
        }
      }
      const sortFn = (a, b) => (a.sort_priority || 0) - (b.sort_priority || 0);
      roots.sort(sortFn);
      for (const [, ch] of childrenOf) ch.sort(sortFn);
      // Flatten into ordered list with depth
      const flat = [];
      const walk = (g, depth) => {
        flat.push({ ...g, _depth: depth });
        const ch = childrenOf.get(g.id) || [];
        for (const c of ch) walk(c, depth + 1);
      };
      for (const r of roots) walk(r, 0);
      return flat;
    };
    return { partTree: buildTree("PART"), serviceTree: buildTree("SERVICE") };
  }, [groups]);

  // Available parents for the create form
  const availableParents = groups.filter(g => g.vendor_type === newGroup.vendor_type && g.is_active !== false);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white text-base">Vendor Groups</CardTitle>
            <p className="text-sm text-gray-400 mt-1">Manage vendor group hierarchies for PART and SERVICE vendors</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleSeed} disabled={seeding} className="border-gray-600 text-gray-300 gap-1">
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Seed Default Groups
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* Create form */}
        <form onSubmit={handleCreate} className="space-y-3 p-3 bg-gray-900/50 rounded-lg">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label className="text-gray-400 text-xs">Group Name *</Label>
              <Input value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} placeholder="e.g., Chrome Plating" className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div className="w-32">
              <Label className="text-gray-400 text-xs">Type *</Label>
              <Select value={newGroup.vendor_type} onValueChange={(v) => setNewGroup({ ...newGroup, vendor_type: v, parent_group_id: "" })}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PART">Part</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Label className="text-gray-400 text-xs">Parent Group</Label>
              <Select value={newGroup.parent_group_id || "__none__"} onValueChange={(v) => setNewGroup({ ...newGroup, parent_group_id: v === "__none__" ? "" : v })}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="None (root)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (root)</SelectItem>
                  {availableParents.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-20">
              <Label className="text-gray-400 text-xs">Priority</Label>
              <Input type="number" value={newGroup.sort_priority} onChange={(e) => setNewGroup({ ...newGroup, sort_priority: parseInt(e.target.value) || 0 })} className="bg-gray-800 border-gray-700 text-white" />
            </div>
            {newGroup.vendor_type === "SERVICE" && (
              <div className="w-36">
                <Label className="text-gray-400 text-xs">Line Type</Label>
                <Select value={newGroup.default_line_item_type} onValueChange={(v) => setNewGroup({ ...newGroup, default_line_item_type: v })}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LINE_ITEM_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 gap-1">
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </Button>
          </div>
        </form>

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HierarchicalGroupColumn
                title="Part Vendor Groups"
                type="PART"
                tree={partTree}
                allGroups={groups}
                editingId={editingId}
                editData={editData}
                onStartEdit={(g) => { setEditingId(g.id); setEditData({ name: g.name, sort_priority: g.sort_priority || 0, parent_group_id: g.parent_group_id || "" }); }}
                onSaveEdit={() => {
                  const data = { ...editData };
                  if (!data.parent_group_id) data.parent_group_id = null;
                  updateMutation.mutate({ id: editingId, data });
                }}
                onCancelEdit={() => { setEditingId(null); setEditData(null); }}
                onEditDataChange={setEditData}
                onDelete={(id) => { if (confirm("Delete this group?")) deleteMutation.mutate(id); }}
                isSaving={updateMutation.isPending}
              />
              <HierarchicalGroupColumn
                title="Service Vendor Groups"
                type="SERVICE"
                tree={serviceTree}
                allGroups={groups}
                editingId={editingId}
                editData={editData}
                onStartEdit={(g) => { setEditingId(g.id); setEditData({ name: g.name, sort_priority: g.sort_priority || 0, default_line_item_type: g.default_line_item_type || "vendor_cost", parent_group_id: g.parent_group_id || "" }); }}
                onSaveEdit={() => {
                  const data = { ...editData };
                  if (!data.parent_group_id) data.parent_group_id = null;
                  updateMutation.mutate({ id: editingId, data });
                }}
                onCancelEdit={() => { setEditingId(null); setEditData(null); }}
                onEditDataChange={setEditData}
                onDelete={(id) => { if (confirm("Delete this group?")) deleteMutation.mutate(id); }}
                isSaving={updateMutation.isPending}
              />
            </div>
            <div className="border-t border-gray-700/50 pt-6">
              <UnclassifiedVendorsPanel />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HierarchicalGroupColumn({ title, type, tree, allGroups, editingId, editData, onStartEdit, onSaveEdit, onCancelEdit, onEditDataChange, onDelete, isSaving }) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  const isService = type === "SERVICE";

  // Parents available for edit dropdown (same type, active)
  const availableParents = allGroups.filter(g => g.vendor_type === type && g.is_active !== false);

  return (
    <div>
      <h3 className={cn("text-sm font-semibold flex items-center gap-2 mb-3", cfg.color)}>
        <Icon className="w-4 h-4" />
        {title} ({tree.length})
      </h3>
      {tree.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">No groups yet — use "Seed Default Groups"</p>
      ) : (
        <div className="space-y-1">
          {tree.map((g) => {
            const isEditing = editingId === g.id;
            const lineLabel = LINE_ITEM_TYPE_OPTIONS.find(o => o.value === g.default_line_item_type)?.label;
            const depth = g._depth || 0;

            return (
              <div key={g.id} className={cn("rounded-lg border", cfg.bg)} style={{ marginLeft: depth * 20 }}>
                {isEditing && editData ? (
                  <div className="p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input value={editData.name} onChange={(e) => onEditDataChange({ ...editData, name: e.target.value })} className="bg-gray-800 border-gray-700 text-white h-7 text-sm flex-1" />
                      <Input type="number" value={editData.sort_priority} onChange={(e) => onEditDataChange({ ...editData, sort_priority: parseInt(e.target.value) || 0 })} className="bg-gray-800 border-gray-700 text-white h-7 text-sm w-16" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-gray-500 text-[10px]">Parent</Label>
                        <Select value={editData.parent_group_id || "__none__"} onValueChange={(v) => onEditDataChange({ ...editData, parent_group_id: v === "__none__" ? "" : v })}>
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-7 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None (root)</SelectItem>
                            {availableParents.filter(p => p.id !== g.id).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isService && (
                        <div className="flex-1">
                          <Label className="text-gray-500 text-[10px]">Line Type</Label>
                          <Select value={editData.default_line_item_type || "vendor_cost"} onValueChange={(v) => onEditDataChange({ ...editData, default_line_item_type: v })}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-7 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LINE_ITEM_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={onSaveEdit} disabled={isSaving} className="h-7 w-7 text-green-400"><Check className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={onCancelEdit} className="h-7 w-7 text-gray-400"><XIcon className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2.5">
                    {depth > 0 && <CornerDownRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
                    <Badge variant="outline" className="text-[10px] bg-gray-800/50 text-gray-400 border-gray-700 shrink-0">#{g.sort_priority || 0}</Badge>
                    <span className="text-sm text-white flex-1 truncate">{g.name}</span>
                    {depth > 0 && (
                      <Badge variant="outline" className="text-[8px] border-gray-600 text-gray-500 shrink-0">sub</Badge>
                    )}
                    {isService && lineLabel && (
                      <Badge variant="outline" className="text-[9px] border-green-700/50 text-green-400 shrink-0">{lineLabel}</Badge>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => onStartEdit(g)} className="h-7 w-7 text-blue-400"><Edit2 className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(g.id)} className="h-7 w-7 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}