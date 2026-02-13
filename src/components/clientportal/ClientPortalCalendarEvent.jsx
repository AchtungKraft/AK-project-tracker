import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { isPast, isToday } from "date-fns";

// Bucket styling
const BUCKET_STYLES = {
  draft: { 
    bg: 'bg-slate-800/80', 
    border: 'border-slate-600', 
    hoverBg: 'hover:bg-slate-700/80',
    text: 'text-slate-300'
  },
  awaiting_client: { 
    bg: 'bg-amber-900/50', 
    border: 'border-amber-600', 
    hoverBg: 'hover:bg-amber-800/50',
    text: 'text-amber-300'
  },
  client_replied: { 
    bg: 'bg-blue-900/50', 
    border: 'border-blue-600', 
    hoverBg: 'hover:bg-blue-800/50',
    text: 'text-blue-300'
  },
  approved: { 
    bg: 'bg-green-900/50', 
    border: 'border-green-600', 
    hoverBg: 'hover:bg-green-800/50',
    text: 'text-green-300'
  }
};

export default function ClientPortalCalendarEvent({ 
  request, 
  projects, 
  getProjectClientSlug,
  expanded = false 
}) {
  const bucket = request.lifecycleBucket || 'awaiting_client';
  const style = BUCKET_STYLES[bucket] || BUCKET_STYLES.awaiting_client;
  const project = projects?.find(p => p.id === request.project_id);
  
  // Check if overdue (not draft, not approved, past due date)
  const isOverdue = request.due_date && 
    bucket !== 'draft' && 
    bucket !== 'approved' && 
    isPast(new Date(request.due_date)) && 
    !isToday(new Date(request.due_date));
  
  if (expanded) {
    // Expanded card for unscheduled section
    return (
      <Link
        to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=${bucket}`}
        className={`block p-2 rounded border ${style.bg} ${style.border} ${style.hoverBg} transition-colors ${
          isOverdue ? 'ring-1 ring-red-500' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-1">
          <span className={`text-xs font-medium truncate ${style.text}`}>
            {request.title}
          </span>
          {isOverdue && <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {project?.name || 'Unknown Project'}
        </p>
      </Link>
    );
  }
  
  // Compact event for calendar cells
  return (
    <Link
      to={createPageUrl("ClientFeedbackDetail") + `?id=${request.id}&projectId=${request.project_id}&from=hub&bucket=${bucket}`}
      className={`block px-1.5 py-0.5 rounded text-xs truncate border-l-2 ${style.bg} ${style.hoverBg} transition-colors ${
        isOverdue ? 'border-l-red-500' : style.border
      }`}
      title={`${request.title} - ${project?.name || 'Unknown'}`}
    >
      <span className={`truncate ${isOverdue ? 'text-red-300' : style.text}`}>
        {request.title}
      </span>
    </Link>
  );
}