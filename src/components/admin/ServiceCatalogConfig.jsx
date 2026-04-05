import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Edit2, Trash2, Check, X as XIcon, Layers, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const servicesByGroup = useMemo(() => {
    const map = {};
    for (const g of vendorGroups) map[g.id] = [];
    const orphans = [];
    for (const svc of services) {
      const gid = svc.preferred_vendor_group_id;
      if (gid && map[gid]) {
        map[gid].push(svc);
      } else {
        orphans.push(svc);
      }
    }
    return { grouped: map, orphans };
  }, [services, vendorGroups]);

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
          Services are organized under their Vendor Group. Add new services within a group.
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
          <div className="space-y-3">
            {vendorGroups.map(group => (
              <GroupSection
                key={group.id}
                group={group}
                services={servicesByGroup.grouped[group.id] || []}
                onInvalidate={invalidate}
              />
            ))}

            {servicesByGroup.orphans.length > 0 && (
              <OrphanSection
                services={servicesByGroup.orphans}
                vendorGroups={vendorGroups}
                onInvalidate={invalidate}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GroupSection({ group, services, onInvalidate }) {
  const [expanded, setExpanded] = useState(true);
  const [addingName, setAddingName] = useState("");
  const [addingDesc, setAddingDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const active = services.filter(s => s.is_active !== false);
  const inactive = services.filter(s => s.is_active === false);

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

  const lineTypeLabel = {
    vendor_cost: "Vendor Cost",
    shipping: "Shipping",
    internal_labor: "Internal Labor",
    misc: "Misc",
  }[group.default_line_item_type] || group.default_line_item_type;

  return (
    <div className="rounded-lg border border-amber-700/40 bg-amber-900/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 hover:bg-amber-900/30 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-amber-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
        )}
        <span className="font-medium text-amber-300 flex-1">{group.name}</span>
        <Badge variant="outline" className="text-[9px] border-green-700/50 text-green-400 shrink-0">
          {lineTypeLabel}
        </Badge>
        <Badge variant="outline" className="text-[10px] border-amber-600/50 text-amber-400 shrink-0">
          {active.length} active
        </Badge>
        {inactive.length > 0 && (
          <Badge variant="outline" className="text-[10px] border-gray-600/50 text-gray-500 shrink-0">
            {inactive.length} inactive
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="border-t border-amber-700/30 p-3 space-y-2">
          {active.length === 0 && inactive.length === 0 && !showAdd && (
            <p className="text-gray-500 text-sm text-center py-2">No services in this group yet</p>
          )}

          {active.map(svc => (
            <ServiceRow key={svc.id} svc={svc} onInvalidate={onInvalidate} />
          ))}

          {inactive.length > 0 && (
            <div className="opacity-50 space-y-2 pt-2 border-t border-gray-700/30">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Inactive</span>
              {inactive.map(svc => (
                <ServiceRow key={svc.id} svc={svc} onInvalidate={onInvalidate} />
              ))}
            </div>
          )}

          {showAdd ? (
            <form onSubmit={handleCreate} className="flex items-end gap-2 pt-2 border-t border-amber-700/30">
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
              className="text-amber-400 hover:text-amber-300 gap-1 w-full mt-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Service to {group.name}
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

function OrphanSection({ services, vendorGroups, onInvalidate }) {
  const reassign = async (svcId, groupId) => {
    await base44.entities.Service.update(svcId, { preferred_vendor_group_id: groupId });
    toast.success("Reassigned");
    onInvalidate();
  };

  return (
    <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-3 space-y-2">
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
            {vendorGroups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}