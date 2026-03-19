import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FolderPlus, ListChecks, ChevronDown, ChevronUp, Upload, X, Loader2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import TaskGroupHeader from "./TaskGroupHeader";
import ToDoTaskItem from "./ToDoTaskItem";

export default function ToDoListDisplay({
  requestId,
  tasks = [],
  taskGroups = [],
  assignableUsers = [],
  assignableContacts = [],
  queryKey,
  token,
  slug,
  onImageClick,
}) {
  const queryClient = useQueryClient();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDetails, setNewTaskDetails] = useState("");
  const [newTaskImages, setNewTaskImages] = useState([]);
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskGroupId, setNewTaskGroupId] = useState("__none__");
  const [showExpandedForm, setShowExpandedForm] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const isReadOnly = !!(token || slug);

  // Single source of truth: taskGroups comes from backend via props
  const groups = taskGroups;

  // Group tasks by group_id
  const { groupedTasks, ungroupedTasks } = useMemo(() => {
    const grouped = {};
    const ungrouped = [];

    for (const task of tasks) {
      if (task.group_id && groups.some((g) => g.id === task.group_id)) {
        if (!grouped[task.group_id]) grouped[task.group_id] = [];
        grouped[task.group_id].push(task);
      } else {
        ungrouped.push(task);
      }
    }
    return { groupedTasks: grouped, ungroupedTasks: ungrouped };
  }, [tasks, groups]);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [groups]);

  const toggleGroup = (groupId) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // --- Group CRUD ---
  // All mutations invalidate the parent queryKey so the backend re-fetches
  // both taskGroups and todoTasks in a single round-trip.
  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    const maxOrder = groups.reduce((max, g) => Math.max(max, g.sort_order || 0), 0);
    await base44.entities.TaskGroup.create({
      request_id: requestId,
      name,
      sort_order: maxOrder + 1,
    });
    setNewGroupName("");
    setShowNewGroup(false);
    queryClient.invalidateQueries({ queryKey });
    toast.success("Group created");
  };

  const handleRenameGroup = async (groupId, newName) => {
    await base44.entities.TaskGroup.update(groupId, { name: newName });
    queryClient.invalidateQueries({ queryKey });
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm("Delete this group? Tasks will become ungrouped.")) return;
    // Ungroup all tasks in this group first
    const tasksInGroup = groupedTasks[groupId] || [];
    await Promise.all(
      tasksInGroup.map((t) =>
        base44.entities.ToDoListTask.update(t.id, { group_id: null })
      )
    );
    await base44.entities.TaskGroup.delete(groupId);
    queryClient.invalidateQueries({ queryKey });
    toast.success("Group deleted");
  };

  // --- Image upload ---
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingImages(true);
    const uploadPromises = files.map(file => base44.integrations.Core.UploadFile({ file }));
    const results = await Promise.all(uploadPromises);
    setNewTaskImages(prev => [...prev, ...results.map(r => r.file_url)]);
    setUploadingImages(false);
    e.target.value = "";
  };

  // --- Task creation ---
  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;

    const taskData = {
      request_id: requestId,
      title,
      group_id: newTaskGroupId === "__none__" ? null : newTaskGroupId,
    };
    if (newTaskDetails.trim()) taskData.details = newTaskDetails.trim();
    if (newTaskImages.length > 0) taskData.images = newTaskImages;
    if (newTaskDueDate) taskData.due_date = newTaskDueDate;
    if (newTaskAssignee) {
      const [type, id] = newTaskAssignee.split(":");
      taskData.assigned_to_id = id;
      taskData.assigned_to_type = type;
    }

    await base44.entities.ToDoListTask.create(taskData);
    // Reset form
    setNewTaskTitle("");
    setNewTaskDetails("");
    setNewTaskImages([]);
    setNewTaskDueDate("");
    setNewTaskAssignee("");
    setShowExpandedForm(false);
    queryClient.invalidateQueries({ queryKey });
    toast.success("Task added");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !showExpandedForm) handleAddTask();
  };

  const completedCount = tasks.filter((t) => t.is_complete).length;
  const totalCount = tasks.length;

  const getGroupCounts = (groupId) => {
    const gTasks = groupedTasks[groupId] || [];
    return {
      total: gTasks.length,
      completed: gTasks.filter((t) => t.is_complete).length,
    };
  };

  const renderTaskList = (taskList) =>
    taskList.map((task) => (
      <ToDoTaskItem
        key={task.id}
        task={task}
        groups={groups}
        assignableUsers={assignableUsers}
        assignableContacts={assignableContacts}
        queryKey={queryKey}
        readOnly={isReadOnly}
        token={token}
        slug={slug}
        onImageClick={onImageClick}
      />
    ));

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-gray-700">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-red-500" />
            <h3 className="font-semibold text-white text-sm">
              To-Do List
            </h3>
            <span className="text-xs text-gray-500">
              {completedCount}/{totalCount} complete
            </span>
          </div>
          {!isReadOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewGroup(!showNewGroup)}
              className="border-gray-600 text-gray-200 hover:bg-gray-700 text-xs h-7"
            >
              <FolderPlus className="w-3 h-3 mr-1" />
              New Group
            </Button>
          )}
        </div>

        {/* New Group Form */}
        {showNewGroup && (
          <div className="flex items-center gap-2 p-2 bg-gray-800/60 rounded-lg border border-gray-700/50">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
              placeholder="Group name..."
              autoFocus
              className="h-8 bg-gray-700 border-gray-600 text-white text-sm flex-1"
            />
            <Button size="sm" onClick={handleCreateGroup} className="h-8 bg-blue-600 hover:bg-blue-700 text-xs">
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowNewGroup(false); setNewGroupName(""); }} className="h-8 text-gray-400 text-xs">
              Cancel
            </Button>
          </div>
        )}

        {/* Add Task Form */}
        {!isReadOnly && (
          <div className="space-y-2 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
            {/* Row 1: Title + quick add */}
            <div className="flex items-center gap-2">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Task name..."
                className="h-9 bg-gray-800 border-gray-700 text-white text-sm flex-1"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowExpandedForm(!showExpandedForm)}
                className="h-9 text-gray-400 hover:text-white shrink-0"
                title={showExpandedForm ? "Less options" : "More options"}
              >
                {showExpandedForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
              <Button size="sm" onClick={handleAddTask} disabled={!newTaskTitle.trim()} className="h-9 bg-red-600 hover:bg-red-700 text-white shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Expanded fields */}
            {showExpandedForm && (
              <div className="space-y-2 pt-1">
                {/* Description */}
                <Textarea
                  value={newTaskDetails}
                  onChange={(e) => setNewTaskDetails(e.target.value)}
                  placeholder="Description (optional)..."
                  className="bg-gray-800 border-gray-700 text-white text-sm min-h-[60px] resize-none"
                />

                {/* Row: Group + Assignee + Due Date */}
                <div className="flex items-center gap-2 flex-wrap">
                  {groups.length > 0 && (
                    <Select value={newTaskGroupId} onValueChange={setNewTaskGroupId}>
                      <SelectTrigger className="h-8 w-36 bg-gray-800 border-gray-700 text-white text-xs">
                        <SelectValue placeholder="Group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Ungrouped</SelectItem>
                        {sortedGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {(assignableUsers.length > 0 || assignableContacts.length > 0) && (
                    <Select value={newTaskAssignee} onValueChange={setNewTaskAssignee}>
                      <SelectTrigger className="h-8 w-40 bg-gray-800 border-gray-700 text-white text-xs">
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
                  )}

                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    <Input
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="h-8 w-36 bg-gray-800 border-gray-700 text-white text-xs"
                    />
                  </div>
                </div>

                {/* Images */}
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="cursor-pointer">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-xs text-gray-300 transition-colors">
                      {uploadingImages ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Add Images
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploadingImages}
                    />
                  </label>
                  {newTaskImages.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {newTaskImages.map((url, idx) => (
                        <div key={idx} className="relative w-12 h-12 rounded border border-gray-700 overflow-hidden group">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => setNewTaskImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-0 right-0 bg-red-600 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Inline group selector when form is collapsed but groups exist */}
            {!showExpandedForm && groups.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={newTaskGroupId} onValueChange={setNewTaskGroupId}>
                  <SelectTrigger className="h-8 w-36 bg-gray-800 border-gray-700 text-white text-xs">
                    <SelectValue placeholder="Group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ungrouped</SelectItem>
                    {sortedGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Grouped Sections */}
        <div className="space-y-4">
          {sortedGroups.map((group) => {
            const counts = getGroupCounts(group.id);
            const isExpanded = !collapsedGroups[group.id];
            return (
              <div key={group.id} className="rounded-xl bg-gray-800/30 border border-blue-500/30 p-3 space-y-2">
                <TaskGroupHeader
                  group={group}
                  isExpanded={isExpanded}
                  onToggle={() => toggleGroup(group.id)}
                  onRename={handleRenameGroup}
                  onDelete={handleDeleteGroup}
                  taskCount={counts.total}
                  completedCount={counts.completed}
                  readOnly={isReadOnly}
                />
                {isExpanded && (
                  <div className="pl-2 space-y-2 pt-1">
                    {(groupedTasks[group.id] || []).length > 0 ? (
                      renderTaskList(groupedTasks[group.id])
                    ) : (
                      <p className="text-xs text-gray-600 italic py-2 pl-2">No tasks in this group</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped section */}
          {ungroupedTasks.length > 0 && (
            <div className={cn(groups.length > 0 && "rounded-xl bg-gray-800/20 border border-blue-500/30 p-3", "space-y-2")}>
              {groups.length > 0 && (
                <div className="flex items-center gap-2 py-1 px-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ungrouped</span>
                  <span className="text-xs text-gray-600">
                    {ungroupedTasks.filter((t) => t.is_complete).length}/{ungroupedTasks.length}
                  </span>
                </div>
              )}
              <div className={cn(groups.length > 0 && "pl-2", "space-y-2")}>
                {renderTaskList(ungroupedTasks)}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <p className="text-sm text-gray-500 italic text-center py-4">No tasks yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}