import React from "react";
import { User, CheckCircle2, Circle } from "lucide-react";

// Helper to get full category path
const getCategoryPath = (categoryId, categories) => {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;
  
  if (category.parent_id) {
    const parent = categories.find(c => c.id === category.parent_id);
    if (parent) {
      return `${parent.name} > ${category.name}`;
    }
  }
  return category.name;
};

export default function TaskCard({ task, teamMembers, categories, statuses, onToggleComplete, onClick }) {
  const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);
  const category = categories.find(c => c.id === task.category_id);
  const categoryPath = getCategoryPath(task.category_id, categories);
  const categoryColor = category?.color;
  
  const taskStatus = statuses.find(s => s.id === task.status_id);
  const isCompleted = taskStatus?.label?.toLowerCase().includes('complete');

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    if (onToggleComplete) {
      onToggleComplete(task);
    }
  };

  return (
    <div
      className="bg-gray-800/50 rounded-lg p-2 border border-gray-700 hover:border-red-700/50 hover:bg-gray-800/70 transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-2">
        <button
          onClick={handleCheckboxClick}
          className="mt-0.5 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0"
        >
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>
        
        <div className="flex-1 min-w-0" onClick={onClick}>
          <h4 className={`text-white font-medium text-sm leading-tight mb-1 line-clamp-2 group-hover:text-red-400 transition-colors ${isCompleted ? 'line-through opacity-60' : ''}`}>
            {task.name}
          </h4>
          
          {categoryPath && (
            <div className="flex items-center gap-1 text-xs mb-0.5">
              <span style={{ color: categoryColor || '#9CA3AF' }}>
                {categoryPath}
              </span>
            </div>
          )}
          
          {assignedMember && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <User className="w-3 h-3 text-gray-500" />
              <span>{assignedMember.full_name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}