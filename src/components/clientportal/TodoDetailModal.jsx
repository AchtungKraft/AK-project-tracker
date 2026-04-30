import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import {
  User, Calendar, FolderOpen, Pencil, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import MoveToGroupPopover from "./MoveToGroupPopover";

export default function TodoDetailModal({
  task,
  open,
  onClose,
  groups = [],
  assignableUsers = [],
  assignableContacts = [],
  queryKey,
  requestId,
  readOnly = false,
  onEdit,
  onImageClick,
}) {
  const queryClient = useQueryClient();
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset index when task changes
  React.useEffect(() => { setActiveIndex(0); }, [task?.id]);

  if (!task) return null;

  const images = task.images || [];
  const hasImages = images.length > 0;

  const handleToggleComplete = async (e) => {
    e.stopPropagation();
    const newComplete = !task.is_complete;
    await base44.entities.ToDoListTask.update(task.id, {
      is_complete: newComplete,
      completed_at: newComplete ? new Date().toISOString() : null,
    });
    queryClient.invalidateQueries({ queryKey });
  };

  const assigneeName = (() => {
    if (!task.assigned_to_id) return null;
    if (task.assigned_to_type === "internal_user") {
      const u = assignableUsers.find((u) => u.id === task.assigned_to_id);
      return u?.full_name || u?.name || "User";
    }
    const c = assignableContacts.find((c) => c.id === task.assigned_to_id);
    return c?.name || "Contact";
  })();

  const groupName = (() => {
    if (!task.group_id) return "Ungrouped";
    const g = groups.find((g) => g.id === task.group_id);
    return g?.name || "Ungrouped";
  })();

  const prevImage = () => setActiveIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  const nextImage = () => setActiveIndex((i) => (i < images.length - 1 ? i + 1 : 0));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white p-0 max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Image Gallery */}
        {hasImages && (
          <div className="relative bg-black/60 flex items-center justify-center min-h-[200px] max-h-[320px]">
            <img
              src={images[activeIndex]}
              alt=""
              className="w-full h-full object-contain max-h-[320px] cursor-pointer"
              onClick={() => onImageClick?.(images, activeIndex)}
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveIndex(i)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-colors",
                        i === activeIndex ? "bg-white" : "bg-white/40"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Title + Status */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={task.is_complete}
              onCheckedChange={handleToggleComplete}
              disabled={readOnly}
              className="mt-1 border-gray-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
            />
            <h2 className={cn(
              "text-lg font-semibold leading-snug flex-1",
              task.is_complete ? "text-gray-500 line-through" : "text-white"
            )}>
              {task.title}
            </h2>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs border-gray-700 text-gray-300 gap-1.5 px-2 py-0.5">
              <FolderOpen className="w-3 h-3" />
              {groupName}
            </Badge>
            {assigneeName && (
              <Badge variant="outline" className="text-xs border-gray-700 text-gray-300 gap-1.5 px-2 py-0.5">
                <User className="w-3 h-3" />
                {assigneeName}
              </Badge>
            )}
            {task.due_date && (
              <Badge variant="outline" className={cn(
                "text-xs gap-1.5 px-2 py-0.5",
                !task.is_complete && new Date(task.due_date) < new Date()
                  ? "border-red-800 text-red-400"
                  : "border-gray-700 text-gray-300"
              )}>
                <Calendar className="w-3 h-3" />
                {format(new Date(task.due_date), "MMM d, yyyy")}
              </Badge>
            )}
            {task.is_complete && (
              <Badge className="bg-green-600/20 text-green-400 border-green-600/40 text-xs px-2 py-0.5">
                Complete
              </Badge>
            )}
          </div>

          {/* Description */}
          {task.details && (
            <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
              {task.details}
            </div>
          )}

          {/* Thumbnail strip (if multiple images) */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {images.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    "w-14 h-14 rounded-md object-cover cursor-pointer shrink-0 border-2 transition-all",
                    i === activeIndex ? "border-blue-500" : "border-gray-700 opacity-60 hover:opacity-100"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!readOnly && (
          <div className="border-t border-gray-800 px-5 py-3 flex items-center gap-2">
            {groups.length > 0 && (
              <MoveToGroupPopover
                task={task}
                groups={groups}
                requestId={requestId}
                queryKey={queryKey}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => { onClose(); onEdit?.(task); }}
              className="border-gray-600 text-gray-200 hover:bg-gray-700 text-xs h-8 gap-1.5"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xs h-8"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}