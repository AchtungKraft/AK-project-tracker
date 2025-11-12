import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Check, X, ChevronRight, ChevronDown } from "lucide-react";

export default function HierarchicalList({ 
  items = [], 
  onUpdate, 
  onDelete, 
  onToggleActive, 
  entityName = "Item",
  showColor = false 
}) {
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editColor, setEditColor] = useState("");
  const [collapsed, setCollapsed] = useState({});

  const parentItems = items.filter(item => !item.parent_id);
  const childrenMap = {};
  
  items.forEach(item => {
    if (item.parent_id) {
      if (!childrenMap[item.parent_id]) {
        childrenMap[item.parent_id] = [];
      }
      childrenMap[item.parent_id].push(item);
    }
  });

  const handleEdit = (item) => {
    setEditing(item.id);
    setEditValue(item.name);
    setEditColor(item.color || "#3B82F6");
  };

  const handleSave = (id) => {
    const updateData = { name: editValue };
    if (showColor) {
      updateData.color = editColor;
    }
    onUpdate(id, updateData);
    setEditing(null);
  };

  const handleCancel = () => {
    setEditing(null);
    setEditValue("");
    setEditColor("");
  };

  const toggleCollapse = (id) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderItem = (item, level = 0) => {
    const hasChildren = childrenMap[item.id] && childrenMap[item.id].length > 0;
    const isCollapsed = collapsed[item.id];

    return (
      <div key={item.id}>
        <div 
          className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition-colors"
          style={{ marginLeft: `${level * 24}px` }}
        >
          <div className="flex items-center gap-3 flex-1">
            {hasChildren && (
              <button
                onClick={() => toggleCollapse(item.id)}
                className="text-gray-400 hover:text-white"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
            
            {!hasChildren && level > 0 && <div className="w-4" />}
            
            {showColor && (
              <div
                className="w-4 h-4 rounded border border-gray-600"
                style={{ backgroundColor: item.color || "#3B82F6" }}
              />
            )}

            {editing === item.id ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white h-8"
                  autoFocus
                />
                {showColor && (
                  <Input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="bg-gray-800 border-gray-700 h-8 w-16 cursor-pointer"
                  />
                )}
              </div>
            ) : (
              <span 
                className="text-white font-medium"
                style={showColor ? { color: item.color || "#FFFFFF" } : {}}
              >
                {item.name}
              </span>
            )}

            {!item.active && (
              <Badge variant="outline" className="text-xs bg-gray-800 text-gray-500">
                Inactive
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {editing === item.id ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleSave(item.id)}
                  className="h-8 w-8 text-green-400 hover:text-green-300"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancel}
                  className="h-8 w-8 text-gray-400 hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onToggleActive(item)}
                  className="h-8 w-8 text-gray-400 hover:text-gray-300"
                >
                  <span className="text-xs">{item.active ? '✓' : '○'}</span>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleEdit(item)}
                  className="h-8 w-8 text-blue-400 hover:text-blue-300"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(item.id)}
                  className="h-8 w-8 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Render children */}
        {hasChildren && !isCollapsed && (
          <div className="mt-2 space-y-2">
            {childrenMap[item.id].map(child => renderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {parentItems.length === 0 && items.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No {entityName.toLowerCase()}s yet
        </div>
      ) : (
        parentItems.map(item => renderItem(item))
      )}
    </div>
  );
}