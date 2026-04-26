import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, Layers, ChevronDown, ChevronRight, AlertTriangle, CornerDownRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildGroupsById, buildHierarchicalOptions } from "@/components/supply/vendorGroupHierarchy";

export default function ServiceCatalogConfig() {
  const queryClient = useQueryClient();

  const { data: services = [], isLoading: loadingServices } = useQuery({
    queryKey: ["services-catalog-admin"],
    queryFn: () => base44.entities.Service.list(),
  });

  const { data: vendorGroups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ["vendorGroups-service"],
    queryFn: async () => {
      const all = await base44.entities.VendorGroup.filter({ vendor_type: "SERVICE", is_active: true });
      return all.sort((a, b) => (a.sort_priority || 0) - (b.sort_priority || 0));
    },
  });

  const groupsById = useMemo(() => buildGroupsById(vendorGroups), [vendorGroups]);

  // Build hierarchical flat list with depth for display
  const groupTree = useMemo(() => buildHierarchicalOptions(vendorGroups, "SERVICE"), [vendorGroups]);

  // Index services by their group
  const { servicesByGroup, orphans } = useMemo(() => {
    const map = {};
    for (const g of vendorGroups) map[g.id] = [];
    const orphanList = [];
    for (const svc of services) {
      const gid = svc.preferred_vendor_group_id;
      if (!gid || !groupsById.has(gid)) {
        orphanList.push(svc);
      } else if (map[gid]) {
        map[gid].push(svc);
      } else {
        orphanList.push(svc);
      }
    }
    return { servicesByGroup: map, orphans: orphanList };
  }, [services, vendorGroups, groupsById]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["services-catalog-admin"] });
    queryClient.invalidateQueries({ queryKey: ["services-catalog"] });
  };

  const isLoading = loadingServices || loadingGroups;

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Layers className="w-5 h-5 text-purple-400" />
          Services by Vendor Group
        </CardTitle>
        <p className="text-sm text-gray-400 mt-1">
          Services are organized hierarchically under Vendor Groups. Add services to any group level.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {vendorGroups.length === 0 && !isLoading && (
          <div className="text-center py-4 text-amber-400 text-sm bg-amber-900/20 border border-amber-700/40 rounded-lg flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            No SERVICE vendor groups found. Create groups first in the "Vendor Groups" tab.
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-1">
            {groupTree.map(entry => (
              <GroupNode
                key={entry.id}
                group={vendorGroups.find(g => g.id === entry.id)}
                depth={entry.depth}
                label={entry.label}
                services={servicesByGroup[entry.id] || []}
                onInvalidate={invalidate}
              />
            ))}

            {orphans.length > 0 && (
              <OrphanSection
                services={orphans}
                vendorGroups={vendorGroups}
                groupsById={groupsById}
                onInvalidate={invalidate}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GroupNode({ group, depth, label, services, onInvalidate }) {
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addingName, setAddingName] = useState("");
  const [addingDesc, setAddingDesc] = useState("");
  const [creating, setCreating] = useState(false);

  if (!group) return null;

  const active = services.filter(s => s.is_active !== false);
  const inactive = services.filter(s => s.is_active === false);
  const totalServices = active.length + inactive.length;

  const lineTypeLabel = {
    vendor_cost: "Vendor Cost",
    shipping: "Shipping",
    internal_labor: "Internal Labor",
    misc: "Misc",
  }[group.default_line_item_type] || group.default_line_item_type;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!addingName.trim()) return;
    setCreating(true);
    try {
      await base44.entities.Service.create({
        name: addingName.trim(),
        preferred_vendor_group_id: group.id,
        description: addingDesc.trim() || null,
        is_active: true,
      });
      toast.success(`Service "${addingName.trim()}" created in ${group.name}`);
      setAddingName("");
      setAddingDesc("");
      setShowAdd(false);
      onInvalidate();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const isChild = depth > 0;

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        isChild ? "border-amber-700/30 bg-amber-900/10" : "border-amber-700/40 bg-amber-900/20"
      )}
      style={{ marginLeft: depth * 20 }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2.5 hover:bg-amber-900/30 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
        {isChild && <CornerDownRight className="w-3 h-3 text-gray-600 shrink-0" />}
        <span className={cn("font-medium flex-1", isChild ? "text-amber-200 text-sm" : "text-amber-300")}>
          {group.name}
        </span>
        {isChild && (
          <Badge variant="outline" className="text-[8px] border-gray-600 text-gray-500 shrink-0">sub</Badge>
        )}
        <Badge variant="outline" className="text-[9px] border-green-700/50 text-green-400 shrink-0">
          {lineTypeLabel}
        </Badge>
        {totalServices > 0 && (
          <Badge variant="outline" className="text-[10px] border-amber-600/50 text-amber-400 shrink-0">
            {active.length} active{inactive.length > 0 ? ` / ${inactive.length} inactive` : ""}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="border-t border-amber-700/30 p-2.5 space-y-1.5">
          {active.map(svc => (
            <ServiceRow key={svc.id} svc={svc} onInvalidate={onInvalidate} />
          ))}

          {inactive.length > 0 && (
            <div className="opacity-50 space-y-1.5 pt-1.5 border-t border-gray-700/30">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Inactive</span>
              {inactive.map(svc => (
                <ServiceRow key={svc.id} svc={svc} onInvalidate={onInvalidate} />
              ))}
            </div>
          )}

          {showAdd ? (
            <form onSubmit={handleCreate} className="flex items-end gap-2 pt-1.5 border-t border-amber-700/30">
              <div className="flex-1">
                <Label className="text-gray-400 text-[10px]">Service Name *</Label>
                <Input
                  value={addingName}
                  onChange={e => setAddingName(e.target.value)}
                  placeholder="e.g. Chrome Plating"
                  className="bg-gray-800 border-gray-700 text-white h-8 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex-1">
                <Label className="text-gray-400 text-[10px]">Description</Label>
                <Input
                  value={addingDesc}
                  onChange={e => setAddingDesc(e.target.value)}
                  placeholder="Optional..."
                  className="bg-gray-800 border-gray-700 text-white h-8 text-sm"
                />
              </div>
              <Button type="submit" size="sm" disabled={creating} className="gap-1 h-8">
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Add
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setShowAdd(false); setAddingName(""); setAddingDesc(""); }} className="h-8">
                <XIcon className="w-3 h-3" />
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAdd(true)}
              className="text-amber-400 hover:text-amber-300 gap-1 w-full mt-0.5 h-7 text-xs"
            >
              <Plus className="w-3 h-3" /> Add Service to {group.name}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceRow({ svc, onInvalidate }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const startEdit = () => {
    setEditName(svc.name || "");
    setEditDesc(svc.description || "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) { toast.error("Name required"); return; }
    await base44.entities.Service.update(svc.id, { name: editName.trim(), description: editDesc.trim() || null });
    toast.success("Updated");
    setEditing(false);
    onInvalidate();
  };

  const toggleActive = async () => {
    await base44.entities.Service.update(svc.id, { is_active: !svc.is_active });
    onInvalidate();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete service "${svc.name}"?`)) return;
    await base44.entities.Service.delete(svc.id);
    toast.success("Deleted");
    onInvalidate();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-md">
        <Input value={editName} onChange={e => setEditName(e.target.value)} className="bg-gray-800 border-gray-700 text-white h-7 text-sm flex-1" />
        <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description..." className="bg-gray-800 border-gray-700 text-white h-7 text-sm flex-1" />
        <Button size="icon" variant="ghost" onClick={saveEdit} className="h-7 w-7 text-green-400">
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setEditing(false)} className="h-7 w-7 text-gray-400">
          <XIcon className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-gray-900/40 rounded-md hover:bg-gray-900/60 transition-colors">
      <span className="text-sm text-white flex-1 truncate">{svc.name}</span>
      {svc.description && <span className="text-[10px] text-gray-500 truncate max-w-[150px]">{svc.description}</span>}
      {svc.is_active === false && (
        <Badge variant="outline" className="text-[10px] bg-gray-800 text-gray-500 border-gray-700">Inactive</Badge>
      )}
      <Button size="icon" variant="ghost" onClick={toggleActive} className="h-7 w-7 text-gray-400" title={svc.is_active !== false ? "Deactivate" : "Activate"}>
        <span className="text-xs">{svc.is_active !== false ? "✓" : "○"}</span>
      </Button>
      <Button size="icon" variant="ghost" onClick={startEdit} className="h-7 w-7 text-blue-400">
        <Edit2 className="w-3 h-3" />
      </Button>
      <Button size="icon" variant="ghost" onClick={handleDelete} className="h-7 w-7 text-red-400">
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}

function OrphanSection({ services, vendorGroups, groupsById, onInvalidate }) {
  const hierarchicalOptions = useMemo(() => buildHierarchicalOptions(vendorGroups, "SERVICE"), [vendorGroups]);

  const reassign = async (svcId, groupId) => {
    await base44.entities.Service.update(svcId, { preferred_vendor_group_id: groupId });
    toast.success("Reassigned");
    onInvalidate();
  };

  return (
    <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-3 space-y-2 mt-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-medium text-red-300">Ungrouped Services ({services.length})</span>
      </div>
      <p className="text-xs text-gray-400">These services have no vendor group or their group was deleted. Reassign them.</p>
      {services.map(svc => (
        <div key={svc.id} className="flex items-center gap-2 p-2 bg-gray-900/40 rounded-md">
          <span className="text-sm text-white flex-1 truncate">{svc.name}</span>
          <select
            className="bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1"
            defaultValue=""
            onChange={e => { if (e.target.value) reassign(svc.id, e.target.value); }}
          >
            <option value="" disabled>Reassign to...</option>
            {hierarchicalOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.depth > 0 ? "  ".repeat(opt.depth) + "↳ " : ""}{opt.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}