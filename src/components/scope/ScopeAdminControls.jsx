import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin controls for managing Scope Categories and Groups independently.
 * Categories and Groups are separate request-level classification systems.
 */
export default function ScopeAdminControls({
  categories = [],
  groups = [],
  items = [],
  onCreateCategory,
  onDeleteCategory,
  onReorderCategory,
  onRenameCategory,
  onCreateGroup,
  onDeleteGroup,
  onReorderGroup,
  onRenameGroup,
  isMobile = false,
}) {
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState("");
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupName, setEditGroupName] = useState("");

  const sortedCats = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const sortedGroups = [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return;
    await onCreateCategory(newCatName.trim());
    setNewCatName("");
    setShowNewCat(false);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    await onCreateGroup(newGroupName.trim());
    setNewGroupName("");
    setShowNewGroup(false);
  };

  const catItemCounts = {};
  const groupItemCounts = {};
  for (const item of items) {
    catItemCounts[item.category_id] = (catItemCounts[item.category_id] || 0) + 1;
    groupItemCounts[item.group_id] = (groupItemCounts[item.group_id] || 0) + 1;
  }

  return (
    <div className="space-y-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Scope Structure</h4>

      <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
        {/* ─── Categories Column ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-widest">Categories</span>
            <Button size="sm" variant="ghost" onClick={() => setShowNewCat(true)} className="h-6 text-[10px] text-gray-400 hover:text-white px-1.5">
              <Plus className="w-3 h-3 mr-0.5" /> Add
            </Button>
          </div>

          {showNewCat && (
            <div className="flex gap-1.5">
              <Input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateCat()}
                placeholder="Category name..." autoFocus
                className="h-7 bg-gray-800 border-gray-700 text-white text-xs flex-1" />
              <Button size="sm" onClick={handleCreateCat} className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700">Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewCat(false); setNewCatName(""); }} className="h-7 px-1.5 text-gray-400"><X className="w-3 h-3" /></Button>
            </div>
          )}

          {sortedCats.map((cat, idx) => (
            <div key={cat.id} className="flex items-center gap-1 group py-0.5 pl-1 border-l-2 border-cyan-700/30">
              {editingCat === cat.id ? (
                <div className="flex gap-1 flex-1">
                  <Input value={editCatName} onChange={e => setEditCatName(e.target.value)}
                    className="h-6 text-xs bg-gray-800 border-gray-700 text-white flex-1" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') { onRenameCategory(cat.id, editCatName); setEditingCat(null); } }} />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { onRenameCategory(cat.id, editCatName); setEditingCat(null); }}>
                    <Save className="w-3 h-3 text-green-400" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingCat(null)}><X className="w-3 h-3 text-gray-400" /></Button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-semibold text-cyan-400 flex-1">{cat.name}</span>
                  <span className="text-[10px] text-gray-600">{catItemCounts[cat.id] || 0}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    {idx > 0 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderCategory(cat.id, -1)}><ChevronUp className="w-3 h-3 text-gray-500" /></Button>}
                    {idx < sortedCats.length - 1 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderCategory(cat.id, 1)}><ChevronDown className="w-3 h-3 text-gray-500" /></Button>}
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); }}><Pencil className="w-3 h-3 text-gray-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDeleteCategory(cat.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                  </div>
                </>
              )}
            </div>
          ))}

          {sortedCats.length === 0 && !showNewCat && (
            <p className="text-[10px] text-gray-600 italic pl-1">No categories yet</p>
          )}
        </div>

        {/* ─── Groups Column ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest">Groups</span>
            <Button size="sm" variant="ghost" onClick={() => setShowNewGroup(true)} className="h-6 text-[10px] text-gray-400 hover:text-white px-1.5">
              <Plus className="w-3 h-3 mr-0.5" /> Add
            </Button>
          </div>

          {showNewGroup && (
            <div className="flex gap-1.5">
              <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                placeholder="Group name..." autoFocus
                className="h-7 bg-gray-800 border-gray-700 text-white text-xs flex-1" />
              <Button size="sm" onClick={handleCreateGroup} className="h-7 text-xs bg-amber-600 hover:bg-amber-700">Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewGroup(false); setNewGroupName(""); }} className="h-7 px-1.5 text-gray-400"><X className="w-3 h-3" /></Button>
            </div>
          )}

          {sortedGroups.map((grp, idx) => (
            <div key={grp.id} className="flex items-center gap-1 group py-0.5 pl-1 border-l-2 border-amber-700/30">
              {editingGroup === grp.id ? (
                <div className="flex gap-1 flex-1">
                  <Input value={editGroupName} onChange={e => setEditGroupName(e.target.value)}
                    className="h-6 text-xs bg-gray-800 border-gray-700 text-white flex-1" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') { onRenameGroup(grp.id, editGroupName); setEditingGroup(null); } }} />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { onRenameGroup(grp.id, editGroupName); setEditingGroup(null); }}>
                    <Save className="w-3 h-3 text-green-400" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingGroup(null)}><X className="w-3 h-3 text-gray-400" /></Button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-medium text-amber-300 flex-1">{grp.name}</span>
                  <span className="text-[10px] text-gray-600">{groupItemCounts[grp.id] || 0}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    {idx > 0 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderGroup(grp.id, -1)}><ChevronUp className="w-3 h-3 text-gray-500" /></Button>}
                    {idx < sortedGroups.length - 1 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderGroup(grp.id, 1)}><ChevronDown className="w-3 h-3 text-gray-500" /></Button>}
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setEditingGroup(grp.id); setEditGroupName(grp.name); }}><Pencil className="w-3 h-3 text-gray-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDeleteGroup(grp.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                  </div>
                </>
              )}
            </div>
          ))}

          {sortedGroups.length === 0 && !showNewGroup && (
            <p className="text-[10px] text-gray-600 italic pl-1">No groups yet</p>
          )}
        </div>
      </div>
    </div>
  );
}