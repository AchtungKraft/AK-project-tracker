import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, FolderPlus, Loader2, Trash2, ChevronUp, ChevronDown, Pencil, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Admin controls for managing Scope Categories and Groups.
 * Does NOT appear in client views.
 */
export default function ScopeAdminControls({
  categories = [],
  groups = [],
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
  const [showNewGroup, setShowNewGroup] = useState(null); // category_id
  const [newGroupName, setNewGroupName] = useState("");
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState("");
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupName, setEditGroupName] = useState("");

  const sortedCats = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return;
    await onCreateCategory(newCatName.trim());
    setNewCatName("");
    setShowNewCat(false);
  };

  const handleCreateGroup = async (catId) => {
    if (!newGroupName.trim()) return;
    await onCreateGroup(catId, newGroupName.trim());
    setNewGroupName("");
    setShowNewGroup(null);
  };

  return (
    <div className="space-y-2 p-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Scope Structure</h4>
        <Button size="sm" variant="outline" onClick={() => setShowNewCat(true)} className="h-7 text-xs border-gray-600 text-gray-300">
          <Plus className="w-3 h-3 mr-1" /> Category
        </Button>
      </div>

      {showNewCat && (
        <div className="flex gap-2">
          <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateCat()}
            placeholder="Category name..." autoFocus className="h-7 bg-gray-800 border-gray-700 text-white text-xs flex-1" />
          <Button size="sm" onClick={handleCreateCat} className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700">Create</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowNewCat(false); setNewCatName(""); }} className="h-7 text-xs text-gray-400">Cancel</Button>
        </div>
      )}

      {sortedCats.map((cat, idx) => {
        const catGroups = groups.filter(g => g.category_id === cat.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        return (
          <div key={cat.id} className="pl-2 border-l-2 border-cyan-700/30 space-y-1">
            <div className="flex items-center gap-1 group">
              {editingCat === cat.id ? (
                <div className="flex gap-1 flex-1">
                  <Input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} className="h-6 text-xs bg-gray-800 border-gray-700 text-white flex-1" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { onRenameCategory(cat.id, editCatName); setEditingCat(null); } }} />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { onRenameCategory(cat.id, editCatName); setEditingCat(null); }}><Save className="w-3 h-3 text-green-400" /></Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingCat(null)}><X className="w-3 h-3 text-gray-400" /></Button>
                </div>
              ) : (
                <>
                  <span className="text-xs font-semibold text-cyan-400 flex-1">{cat.name}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    {idx > 0 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderCategory(cat.id, -1)}><ChevronUp className="w-3 h-3 text-gray-500" /></Button>}
                    {idx < sortedCats.length - 1 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderCategory(cat.id, 1)}><ChevronDown className="w-3 h-3 text-gray-500" /></Button>}
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); }}><Pencil className="w-3 h-3 text-gray-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDeleteCategory(cat.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setShowNewGroup(cat.id); setNewGroupName(""); }}><FolderPlus className="w-3 h-3 text-gray-500" /></Button>
                  </div>
                </>
              )}
            </div>

            {showNewGroup === cat.id && (
              <div className="flex gap-1 pl-3">
                <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup(cat.id)}
                  placeholder="Group name..." autoFocus className="h-6 bg-gray-800 border-gray-700 text-white text-xs flex-1" />
                <Button size="sm" onClick={() => handleCreateGroup(cat.id)} className="h-6 text-xs bg-gray-700">Add</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewGroup(null)} className="h-6 text-xs text-gray-400">Cancel</Button>
              </div>
            )}

            {catGroups.map((grp, gIdx) => (
              <div key={grp.id} className="flex items-center gap-1 pl-3 group/g">
                {editingGroup === grp.id ? (
                  <div className="flex gap-1 flex-1">
                    <Input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="h-6 text-xs bg-gray-800 border-gray-700 text-white flex-1" autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { onRenameGroup(grp.id, editGroupName); setEditingGroup(null); } }} />
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { onRenameGroup(grp.id, editGroupName); setEditingGroup(null); }}><Save className="w-3 h-3 text-green-400" /></Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingGroup(null)}><X className="w-3 h-3 text-gray-400" /></Button>
                  </div>
                ) : (
                  <>
                    <span className="text-[11px] text-gray-400 flex-1">{grp.name}</span>
                    <div className="hidden group-hover/g:flex items-center gap-0.5">
                      {gIdx > 0 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderGroup(grp.id, -1)}><ChevronUp className="w-3 h-3 text-gray-500" /></Button>}
                      {gIdx < catGroups.length - 1 && <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onReorderGroup(grp.id, 1)}><ChevronDown className="w-3 h-3 text-gray-500" /></Button>}
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setEditingGroup(grp.id); setEditGroupName(grp.name); }}><Pencil className="w-3 h-3 text-gray-500" /></Button>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDeleteGroup(grp.id)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}