import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronDown, Edit2, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HierarchicalList({ 
  items, 
  onUpdate, 
  onDelete, 
  onToggleActive,
  nameField = "name",
  showColorPicker = false,
}) {
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editColor, setEditColor] = useState("");

  const buildTree = (items) => {
    const itemMap = {};
    const roots = [];

    items.forEach(item => {
      itemMap[item.id] = { ...item, children: [] };
    });

    items.forEach(item => {
      if (item.parent_id && itemMap[item.parent_id]) {
        itemMap[item.parent_id].children.push(itemMap[item.id]);
      } else {
        roots.push(itemMap[item.id]);
      }
    });

    const sortItems = (items) => {
      return items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => ({
        ...item,
        children: sortItems(item.children || [])
      }));
    };

    return sortItems(roots);
  };

  const toggleExpanded = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setEditValue(item[nameField]);
    if (showColorPicker && item.color) {
      setEditColor(item.color);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue("");
    setEditColor("");
  };

  const saveEdit = (item) => {
    const updates = { [nameField]: editValue };
    if (showColorPicker) {
      updates.color = editColor;
    }
    onUpdate(item.id, updates);
    cancelEdit();
  };

  const renderItem = (item, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expanded[item.id];
    const isEditing = editing === item.id;

    return (
      <div key={item.id}>
        <div
          className={cn(
            "flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-800/50 transition-colors",
            level > 0 && "ml-6"
          )}
        >
          {hasChildren && (
            <button
              onClick={() => toggleExpanded(item.id)}
              className="text-gray-400 hover:text-white"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          
          {!hasChildren && <div className="w-4" />}

          {isEditing ? (
            <>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 bg-gray-800 border-gray-700 text-white h-8"
                autoFocus
              />
              {showColorPicker && (
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer bg-gray-800 border border-gray-700"
                />
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => saveEdit(item)}
                className="h-8 w-8 text-green-400"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={cancelEdit}
                className="h-8 w-8 text-red-400"
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1 flex items-center gap-2">
                {showColorPicker && item.color && (
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <span className={cn(
                  "text-white",
                  !item.active && "text-gray-500 line-through"
                )}>
                  {item[nameField]}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onToggleActive(item.id, item)}
                  className={cn(
                    "h-8 text-xs",
                    item.active ? "text-green-400" : "text-gray-500"
                  )}
                >
                  {item.active ? 'Active' : 'Inactive'}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(item)}
                  className="h-8 w-8 text-blue-400"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(item.id)}
                  className="h-8 w-8 text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-4">
            {item.children.map(child => renderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const tree = buildTree(items);

  return (
    <div className="space-y-1">
      {tree.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No items yet. Add one above.
        </div>
      ) : (
        tree.map(item => renderItem(item))
      )}
    </div>
  );
}