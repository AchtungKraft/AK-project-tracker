import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  AlertCircle, 
  Calendar as CalendarIcon, 
  Clock,
  MessageSquareText,
  CheckCircle2,
  Wrench,
  ExternalLink
} from "lucide-react";
import { format, isPast, isToday, parseISO, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { LIFECYCLE_BUCKET_CONFIG } from "./requestCalendarAdapter";

export default function RequestCalendarCard({ 
  item, 
  projects,
  compact = false,
  onUpdateDueDate,
  showInlineControls = true,
}) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  const bucketConfig = LIFECYCLE_BUCKET_CONFIG[item.lifecycle_bucket] || LIFECYCLE_BUCKET_CONFIG.awaiting_client;
  const project = projects?.find(p => p.id === item.project_id);
  
  // Check overdue status
  const isOverdue = item.is_overdue || (
    item.due_date && 
    item.lifecycle_bucket !== 'draft' && 
    item.lifecycle_bucket !== 'approved' &&
    isPast(parseISO(item.due_date)) && 
    !isToday(parseISO(item.due_date))
  );
  
  const handleDateSelect = async (date) => {
    if (onUpdateDueDate) {
      await onUpdateDueDate(item.id, date ? format(date, 'yyyy-MM-dd') : null);
    }
    setDatePickerOpen(false);
  };
  
  const isApproval = item.lifecycle_bucket === 'recently_approved' || item.lifecycle_bucket === 'approved';
  
  const bucketIcons = {
    draft: Wrench,
    awaiting_client: Clock,
    client_replied: MessageSquareText,
    recently_approved: CheckCircle2,
    approved: CheckCircle2,
  };
  const BucketIcon = bucketIcons[item.lifecycle_bucket] || Clock;
  
  if (compact) {
    return (
      <Link
        to={createPageUrl("ClientFeedbackDetail") + `?id=${item.id}&projectId=${item.project_id}&from=hub&bucket=${item.lifecycle_bucket}`}
        className={cn(
          "block px-2 py-1.5 rounded border-l-2 transition-colors",
          isApproval ? "bg-emerald-900/20 border-l-emerald-500" : bucketConfig.bgClass,
          isOverdue ? "border-l-red-500" : isApproval ? "border-l-emerald-500" : bucketConfig.borderClass,
          "hover:opacity-80"
        )}
      >
        <div className="flex items-start justify-between gap-1">
          {isApproval && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />}
          <span className={cn("text-xs font-medium truncate flex-1", isOverdue ? "text-red-300" : isApproval ? "text-emerald-300" : bucketConfig.textClass)}>
            {item.name}
          </span>
          {isOverdue && <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />}
        </div>
        {item.project_name && (
          <p className="text-[10px] text-gray-500 truncate mt-0.5">{item.project_name}</p>
        )}
      </Link>
    );
  }
  
  return (
    <Card 
      className={cn(
        "transition-all hover:shadow-md relative",
        isApproval
          ? "bg-gradient-to-br from-emerald-950/30 to-gray-900/50 border-emerald-500/50 shadow-emerald-900/10"
          : bucketConfig.bgClass,
        "border",
        isOverdue ? "border-red-500/50 ring-1 ring-red-500/30" : isApproval ? "border-emerald-500/50" : bucketConfig.borderClass
      )}
    >
      {/* Green left accent for approvals */}
      {isApproval && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l" />}
      <CardContent className={cn("p-3 space-y-2", isApproval && "pl-4")}>
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <BucketIcon className={cn("w-4 h-4 shrink-0", isApproval ? "text-emerald-400" : bucketConfig.textClass)} />
            <Link
              to={createPageUrl("ClientFeedbackDetail") + `?id=${item.id}&projectId=${item.project_id}&from=hub&bucket=${item.lifecycle_bucket}`}
              className={cn(
                "font-medium text-sm truncate hover:underline",
                isOverdue ? "text-red-300" : isApproval ? "text-emerald-200" : "text-white"
              )}
            >
              {item.name}
            </Link>
          </div>
          
          {isApproval && (
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] shrink-0">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Approved
            </Badge>
          )}
          {isOverdue && !isApproval && (
            <Badge className="bg-red-600/20 text-red-400 border-red-600/50 text-[10px] shrink-0">
              <AlertCircle className="w-3 h-3 mr-1" />
              Overdue
            </Badge>
          )}
        </div>

        {/* Approval prominent line */}
        {isApproval && (
          <p className="text-emerald-400/80 text-xs font-medium">
            Approved by Client
            {item.source_request?.approvedAt && (
              <span className="text-emerald-500/60 ml-1">
                • {formatDistanceToNow(new Date(item.source_request.approvedAt), { addSuffix: true })}
              </span>
            )}
          </p>
        )}
        
        {/* Project & Type */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={cn("truncate", isApproval ? "text-gray-500" : "text-gray-400")}>
            {item.project_name || 'Unknown Project'}
            {item.client_name && <span className="text-gray-500"> • {item.client_name}</span>}
          </span>
          <Badge variant="outline" className={cn("text-[10px] shrink-0", isApproval ? "border-emerald-500/30 text-emerald-400/70" : bucketConfig.borderClass + " " + bucketConfig.textClass)}>
            {bucketConfig.label}
          </Badge>
        </div>
        
        {/* Due Date with Inline Edit */}
        {showInlineControls && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-800">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-2 text-xs gap-1.5",
                    item.due_date 
                      ? isOverdue 
                        ? "text-red-400 hover:text-red-300" 
                        : "text-gray-300 hover:text-white"
                      : "text-gray-500 hover:text-gray-300"
                  )}
                >
                  <CalendarIcon className="w-3 h-3" />
                  {item.due_date 
                    ? format(parseISO(item.due_date), 'MMM d, yyyy')
                    : 'Set due date'
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={item.due_date ? parseISO(item.due_date) : undefined}
                  onSelect={handleDateSelect}
                  initialFocus
                />
                {item.due_date && (
                  <div className="p-2 border-t border-gray-800">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-red-400 hover:text-red-300"
                      onClick={() => handleDateSelect(null)}
                    >
                      Clear due date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            
            <Link
              to={createPageUrl("ClientFeedbackDetail") + `?id=${item.id}&projectId=${item.project_id}&from=hub&bucket=${item.lifecycle_bucket}`}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}