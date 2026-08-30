import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2, GripVertical, DollarSign, Pencil, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function ScopeLaborGroupsConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newRate, setNewRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['scopeLaborGroups'],
    queryFn: () => base44.entities.ScopeLaborGroup.list('sort_order'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scopeLaborGroups'] });

  const handleCreate = async () => {
    if (!newName.trim() || !newCode.trim() || !newRate) return;
    setSaving(true);
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.sort_order || 0), 0);
    await base44.entities.ScopeLaborGroup.create({
      name: newName.trim(),
      code: newCode.trim().toUpperCase(),
      hourly_rate: Number(newRate),
      sort_order: maxOrder + 10,
      is_active: true,
    });
    setNewName(""); setNewCode(""); setNewRate(""); setAddMode(false);
    setSaving(false);
    invalidate();
    toast({ description: "Labor group created" });
  };

  const handleToggleActive = async (id, current) => {
    await base44.entities.ScopeLaborGroup.update(id, { is_active: !current });
    invalidate();
  };

  const handleReorder = async (id, direction) => {
    const sorted = [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sorted.findIndex(g => g.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      base44.entities.ScopeLaborGroup.update(a.id, { sort_order: b.sort_order || 0 }),
      base44.entities.ScopeLaborGroup.update(b.id, { sort_order: a.sort_order || 0 }),
    ]);
    invalidate();
  };

  const startEdit = (group) => {
    setEditingId(group.id);
    setEditData({ name: group.name, code: group.code, hourly_rate: group.hourly_rate, description: group.description || '' });
  };

  const saveEdit = async () => {
    if (!editData.name?.trim() || !editData.hourly_rate) return;
    await base44.entities.ScopeLaborGroup.update(editingId, {
      name: editData.name.trim(),
      code: (editData.code || '').trim().toUpperCase(),
      hourly_rate: Number(editData.hourly_rate),
      description: editData.description?.trim() || null,
    });
    setEditingId(null);
    invalidate();
    toast({ description: "Labor group updated" });
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>;
  }

  const sorted = [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">AK Labor Rates</h2>
          <p className="text-xs text-gray-500 mt-0.5">Company-standard hourly rates for scope estimating</p>
        </div>
        <Button size="sm" onClick={() => setAddMode(true)} disabled={addMode} className="bg-red-600 hover:bg-red-700 text-white gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Labor Group
        </Button>
      </div>

      {addMode && (
        <Card className="border-cyan-700/40 bg-cyan-950/10">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-medium text-cyan-300">New Labor Group</p>
            <div className="flex gap-2 flex-wrap">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (e.g. Design)"
                className="h-8 w-40 bg-gray-800 border-gray-700 text-white text-xs" autoFocus />
              <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code (e.g. DESIGN)"
                className="h-8 w-32 bg-gray-800 border-gray-700 text-white text-xs uppercase" />
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">$</span>
                <Input type="number" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="Rate"
                  className="h-8 w-24 bg-gray-800 border-gray-700 text-white text-xs" />
                <span className="text-xs text-gray-500">/hr</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || !newCode.trim() || !newRate || saving}
                className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1 h-7 text-xs">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddMode(false)} className="text-gray-400 h-7 text-xs">
                <X className="w-3 h-3 mr-1" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-1">
        {sorted.map((group, idx) => (
          <Card key={group.id} className={cn("border transition-colors", group.is_active ? "border-gray-700/50 bg-gray-800/30" : "border-gray-800/30 bg-gray-900/20 opacity-60")}>
            <CardContent className="p-3">
              {editingId === group.id ? (
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <Input value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                      className="h-8 w-40 bg-gray-800 border-gray-700 text-white text-xs" />
                    <Input value={editData.code} onChange={e => setEditData(d => ({ ...d, code: e.target.value }))}
                      className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs uppercase" />
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">$</span>
                      <Input type="number" value={editData.hourly_rate} onChange={e => setEditData(d => ({ ...d, hourly_rate: e.target.value }))}
                        className="h-8 w-24 bg-gray-800 border-gray-700 text-white text-xs" />
                      <span className="text-xs text-gray-500">/hr</span>
                    </div>
                  </div>
                  <Input value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                    placeholder="Description (optional)" className="h-8 bg-gray-800 border-gray-700 text-white text-xs" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} className="bg-green-600 hover:bg-green-700 text-white gap-1 h-7 text-xs">
                      <Check className="w-3 h-3" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-gray-400 h-7 text-xs">Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => handleReorder(group.id, -1)} disabled={idx === 0}
                      className="text-gray-600 hover:text-gray-400 disabled:opacity-30 text-[10px]">▲</button>
                    <button onClick={() => handleReorder(group.id, 1)} disabled={idx === sorted.length - 1}
                      className="text-gray-600 hover:text-gray-400 disabled:opacity-30 text-[10px]">▼</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">{group.name}</span>
                      <span className="text-[10px] text-gray-600 font-mono">{group.code}</span>
                    </div>
                    {group.description && <p className="text-[11px] text-gray-500 mt-0.5">{group.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-sm font-bold text-emerald-400">{group.hourly_rate}</span>
                    <span className="text-xs text-gray-500">/hr</span>
                  </div>
                  <Switch checked={group.is_active} onCheckedChange={() => handleToggleActive(group.id, group.is_active)} />
                  <Button size="sm" variant="ghost" onClick={() => startEdit(group)} className="h-7 w-7 p-0 text-gray-500 hover:text-white">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {sorted.length === 0 && !addMode && (
        <p className="text-gray-500 text-sm text-center py-6">No labor groups configured yet.</p>
      )}
    </div>
  );
}