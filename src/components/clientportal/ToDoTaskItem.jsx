import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, User, Calendar, FolderOpen, Pencil, Save, X, Upload, Loader2 } from "lucide-react";
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
  onImageClick,
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editGroupId, setEditGroupId] = useState("__none__");
  const [editImages, setEditImages] = useState([]);

  const startEditing = () => {
    setEditTitle(task.title || "");
    setEditDetails(task.details || "");
    setEditDueDate(task.due_date || "");
    setEditAssignee(
      task.assigned_to_id ? `${task.assigned_to_type}:${task.assigned_to_id}` : ""
    );
    setEditGroupId(task.group_id || "__none__");
    setEditImages(task.images || []);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    const title = editTitle.trim();
    if (!title) return;
    setSaving(true);

    const updateData = {
      title,
      details: editDetails.trim() || null,
      due_date: editDueDate || null,
      group_id: editGroupId === "__none__" ? null : editGroupId,
      images: editImages.length > 0 ? editImages : null,
    };

    if (editAssignee) {
      const [type, id] = editAssignee.split(":");
      updateData.assigned_to_id = id;
      updateData.assigned_to_type = type;
    } else {
      updateData.assigned_to_id = null;
      updateData.assigned_to_type = null;
    }

    await base44.entities.ToDoListTask.update(task.id, updateData);
    setSaving(false);
    setEditing(false);
    queryClient.invalidateQueries({ queryKey });
    toast.success("Task updated");
  };

  const handleToggleComplete = async () => {
    const newComplete = !task.is_complete;
    await base44.entities.ToDoListTask.update(task.id, {
      is_complete: newComplete,
      completed_at: newComplete ? new Date().toISOString() : null,
    });
    queryClient.invalidateQueries({ queryKey });
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task?")) return;
    await base44.entities.ToDoListTask.delete(task.id);
    queryClient.invalidateQueries({ queryKey });
    toast.success("Task deleted");
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    const results = await Promise.all(
      files.map((file) => base44.integrations.Core.UploadFile({ file }))
    );
    setEditImages((prev) => [...prev, ...results.map((r) => r.file_url)]);
    setUploading(false);
    e.target.value = "";
  };

  const removeEditImage = (idx) => {
    setEditImages((prev) => prev.filter((_, i) => i !== idx));
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

  const hasImages = task.images?.length > 0;
  const hasDetails = !!task.details;
  const hasMeta = assigneeName || task.due_date;

  // ── EDIT MODE ──
  if (editing && !readOnly) {
    return (
      <div className="rounded-lg border border-blue-700/50 bg-gray-800/60 p-3 space-y-2.5">
        {/* Title */}
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Task name..."
          className="h-8 bg-gray-800 border-gray-700 text-white text-sm font-medium"
          autoFocus
        />

        {/* Description */}
        <Textarea
          value={editDetails}
          onChange={(e) => setEditDetails(e.target.value)}
          placeholder="Description (optional)..."
          className="bg-gray-800 border-gray-700 text-white text-xs min-h-[50px] resize-none"
        />

        {/* Selectors row */}
        <div className="flex items-center gap-2 flex-wrap">
          {(assignableUsers.length > 0 || assignableContacts.length > 0) && (
            <Select value={editAssignee || "unassigned"} onValueChange={(v) => setEditAssignee(v === "unassigned" ? "" : v)}>
              <SelectTrigger className="h-7 w-40 bg-gray-700 border-gray-600 text-white text-xs">
                <SelectValue placeholder="Assign to..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
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
          )}

          {groups.length > 0 && (
            <Select value={editGroupId} onValueChange={setEditGroupId}>
              <SelectTrigger className="h-7 w-36 bg-gray-700 border-gray-600 text-white text-xs">
                <FolderOpen className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Group..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ungrouped</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-gray-500" />
            <Input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="h-7 w-36 bg-gray-700 border-gray-600 text-white text-xs"
            />
          </div>
        </div>

        {/* Images editing */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="cursor-pointer">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-[11px] text-gray-300 transition-colors">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Add Images
            </div>
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
          {editImages.map((url, idx) => (
            <div key={idx} className="relative w-10 h-10 rounded border border-gray-700 overflow-hidden group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removeEditImage(idx)}
                className="absolute top-0 right-0 bg-red-600 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!editTitle.trim() || saving}
            className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={cancelEditing}
            className="h-7 text-gray-400 hover:text-white text-xs gap-1"
          >
            <X className="w-3 h-3" />
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            className="h-7 text-red-400 hover:text-red-300 text-xs ml-auto gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  // ── VIEW MODE ──
  return (
    <div className={cn(
      "rounded-lg border transition-all duration-150",
      task.is_complete
        ? "bg-gray-900/40 border-gray-800/60"
        : "bg-gray-800/60 border-gray-700/50 hover:border-gray-500/50 hover:bg-gray-800/80 hover:shadow-md hover:shadow-black/20"
    )}>
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={task.is_complete}
          onCheckedChange={handleToggleComplete}
          disabled={readOnly && !token && !slug}
          className="mt-0.5 border-gray-600 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
        />
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title */}
          <p className={cn(
            "text-sm font-medium leading-snug",
            task.is_complete ? "text-gray-500 line-through" : "text-white"
          )}>
            {task.title}
          </p>

          {/* Description - 2 lines max */}
          {hasDetails && (
            <p className={cn(
              "text-xs leading-relaxed line-clamp-2",
              task.is_complete ? "text-gray-600" : "text-gray-400"
            )}>
              {task.details}
            </p>
          )}

          {/* Image thumbnails */}
          {hasImages && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mb-0.5 scrollbar-hide">
              {task.images.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt=""
                  onClick={() => onImageClick?.(task.images, idx)}
                  className={cn(
                    "w-12 h-12 rounded border object-cover cursor-pointer shrink-0 transition-opacity hover:opacity-80",
                    task.is_complete ? "border-gray-800 opacity-50" : "border-gray-700"
                  )}
                />
              ))}
            </div>
          )}

          {/* Metadata badges */}
          {hasMeta && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {assigneeName && (
                <Badge variant="outline" className="text-[10px] h-5 border-gray-700 text-gray-400 gap-1 px-1.5">
                  <User className="w-2.5 h-2.5" />
                  {assigneeName}
                </Badge>
              )}
              {task.due_date && (
                <Badge variant="outline" className={cn(
                  "text-[10px] h-5 gap-1 px-1.5",
                  !task.is_complete && new Date(task.due_date) < new Date()
                    ? "border-red-800 text-red-400"
                    : "border-gray-700 text-gray-400"
                )}>
                  <Calendar className="w-2.5 h-2.5" />
                  {format(new Date(task.due_date), "MMM d")}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Edit toggle */}
        {!readOnly && (
          <Button
            size="icon"
            variant="ghost"
            onClick={startEditing}
            className="h-7 w-7 shrink-0 text-gray-500 hover:text-white"
          >
            <Pencil className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}