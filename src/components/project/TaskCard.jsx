import React from "react";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, Tag } from "lucide-react";
import { format } from "date-fns";

export default function TaskCard({ task, categories, teamMembers, onClick }) {
  const category = categories.find(c => c.id === task.category_id);
  const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  const getCategoryPath = (categoryId) => {
    if (!categoryId) return null;
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return null;
    
    if (cat.parent_id) {
      const parent = categories.find(c => c.id === cat.parent_id);
      if (parent) {
        return `${parent.name} > ${cat.name}`;
      }
    }
    return cat.name;
  };

  return (
    <div
      onClick={onClick}
      className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 hover:border-red-700/50 hover:bg-gray-800/70 transition-all cursor-pointer group"
    >
      <h4 className="text-white font-medium text-sm mb-2 line-clamp-2 group-hover:text-red-400 transition-colors">
        {task.name}
      </h4>
      
      {task.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="space-y-1.5">
        {category && (
          <div className="flex items-center gap-1.5 text-xs">
            <Tag className="w-3 h-3 text-gray-500" />
            <span style={{ color: category.color || '#9CA3AF' }}>
              {getCategoryPath(task.category_id)}
            </span>
          </div>
        )}

        {assignedMember && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <User className="w-3 h-3 text-gray-500" />
            <span>{assignedMember.full_name}</span>
          </div>
        )}

        {task.due_date && (
          <div className={`flex items-center gap-1.5 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}`}>
            <Calendar className="w-3 h-3" />
            <span>{format(new Date(task.due_date), 'MMM d')}</span>
          </div>
        )}
      </div>
    </div>
  );
}