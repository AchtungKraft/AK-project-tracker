import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TaskGroupHeader({
  group,
  isExpanded,
  onToggle,
  onRename,
  onDelete,
  taskCount,
  completedCount,
  readOnly = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);

  const handleSave = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== group.name) {
      onRename(group.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(group.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  return (
    <div className="flex items-center gap-2 py-2.5 px-3 bg-gray-700/40 rounded-lg border border-red-500/30 group/header">
      {!readOnly && (
        <GripVertical className="w-4 h-4 text-gray-600 opacity-0 group-hover/header:opacity-100 transition-opacity cursor-grab shrink-0" />
      )}
      
      <button onClick={onToggle} className="shrink-0 text-gray-400 hover:text-white transition-colors">
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {isEditing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="h-7 bg-gray-700 border-gray-600 text-white text-sm px-2"
          />
          <Button size="icon" variant="ghost" onClick={handleSave} className="h-7 w-7 text-green-400 hover:text-green-300">
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCancel} className="h-7 w-7 text-gray-400 hover:text-gray-300">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <span className="text-sm font-semibold text-gray-100 flex-1 min-w-0 truncate">{group.name}</span>
          <span className="text-xs text-gray-400 shrink-0 tabular-nums">
            {completedCount}/{taskCount}
          </span>
          {!readOnly && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setEditName(group.name); setIsEditing(true); }}
                className="h-6 w-6 text-gray-400 hover:text-white"
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDelete(group.id)}
                className="h-6 w-6 text-gray-400 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}