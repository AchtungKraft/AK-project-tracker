import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, ChevronDown, ChevronUp, User, Calendar, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function ToDoTaskItem({
  task,
  groups = [],
  assignableUsers = [],
  assignableContacts = [],
  queryKey,
  readOnly = false,
  token,
  slug,
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const handleToggleComplete = async () => {
    const newComplete = !task.is_complete;
    await base44.entities.ToDoListTask.update(task.id, {
      is_complete: newComplete,
      completed_at: newComplete ? new Date().toISOString() : null,
    });
    queryClient.invalidateQueries({ queryKey });
  };

  const handleAssign = async (value) => {
    const [type, id] = value.split(":");
    await base44.entities.ToDoListTask.update(task.id, {
      assigned_to_id: id,
      assigned_to_type: type,
    });
    queryClient.invalidateQueries({ queryKey });
  };

  const handleGroupChange = async (value) => {
    await base44.entities.ToDoListTask.update(task.id, {
      group_id: value === "__none__" ? null : value,
    });
    queryClient.invalidateQueries({ queryKey });
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task?")) return;
    await base44.entities.ToDoListTask.delete(task.id);
    queryClient.invalidateQueries({ queryKey });
    toast.success("Task deleted");
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

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      task.is_complete
        ? "bg-gray-900/30 border-gray-800"
        : "bg-gray-800/40 border-gray-700/50 hover:border-gray-600/50"
    )}>
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={task.is_complete}
          onCheckedChange={handleToggleComplete}
          disabled={readOnly && !token && !slug}
          className="mt-0.5 border-gray-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
        />
        <div className="flex-1 min-w-0">
          <span className={cn(
            "text-sm",
            task.is_complete ? "text-gray-500 line-through" : "text-white"
          )}>
            {task.title}
          </span>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {assigneeName && (
              <Badge variant="outline" className="text-xs border-gray-600 text-gray-400 gap-1">
                <User className="w-3 h-3" />
                {assigneeName}
              </Badge>
            )}
            {task.due_date && (
              <Badge variant="outline" className="text-xs border-gray-600 text-gray-400 gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(task.due_date), "MMM d")}
              </Badge>
            )}
          </div>
        </div>
        
        {!readOnly && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="h-7 w-7 text-gray-400 hover:text-white"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        )}
      </div>

      {expanded && !readOnly && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-700/30 space-y-2">
          {task.details && (
            <p className="text-xs text-gray-400">{task.details}</p>
          )}
          
          {task.images?.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {task.images.map((url, idx) => (
                <img key={idx} src={url} alt="" className="w-16 h-16 rounded border border-gray-700 object-cover" />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {/* Assign */}
            <Select
              value={task.assigned_to_id ? `${task.assigned_to_type}:${task.assigned_to_id}` : undefined}
              onValueChange={handleAssign}
            >
              <SelectTrigger className="h-7 w-40 bg-gray-700 border-gray-600 text-white text-xs">
                <SelectValue placeholder="Assign to..." />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => (
                  <SelectItem key={u.id} value={`internal_user:${u.id}`}>
                    {u.full_name || u.name}
                  </SelectItem>
                ))}
                {assignableContacts.map((c) => (
                  <SelectItem key={c.id} value={`client_contact:${c.id}`}>
                    {c.name} (Client)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Group selector */}
            {groups.length > 0 && (
              <Select
                value={task.group_id || "__none__"}
                onValueChange={handleGroupChange}
              >
                <SelectTrigger className="h-7 w-40 bg-gray-700 border-gray-600 text-white text-xs">
                  <FolderOpen className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Group..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ungrouped</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              className="h-7 text-red-400 hover:text-red-300 text-xs ml-auto"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}