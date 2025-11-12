import React from "react";
import { User } from "lucide-react";

export default function TaskCard({ task, teamMembers, onClick }) {
  const assignedMember = teamMembers.find(m => m.id === task.assigned_team_member_id);

  return (
    <div
      onClick={onClick}
      className="bg-gray-800/50 rounded-lg p-2 border border-gray-700 hover:border-red-700/50 hover:bg-gray-800/70 transition-all cursor-pointer group"
    >
      <h4 className="text-white font-medium text-sm leading-tight mb-1 line-clamp-2 group-hover:text-red-400 transition-colors">
        {task.name}
      </h4>
      
      {assignedMember && (
        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
          <User className="w-3 h-3 text-gray-500" />
          <span>{assignedMember.full_name}</span>
        </div>
      )}
    </div>
  );
}