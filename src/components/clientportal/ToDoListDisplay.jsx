import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FolderPlus, ListChecks } from "lucide-react";
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
}) {
  const queryClient = useQueryClient();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskGroupId, setNewTaskGroupId] = useState("__none__");
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

  // --- Task creation ---
  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    await base44.entities.ToDoListTask.create({
      request_id: requestId,
      title,
      group_id: newTaskGroupId === "__none__" ? null : newTaskGroupId,
    });
    setNewTaskTitle("");
    queryClient.invalidateQueries({ queryKey });
    toast.success("Task added");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleAddTask();
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
          <div className="flex items-center gap-2">
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a task..."
              className="h-9 bg-gray-800 border-gray-700 text-white text-sm flex-1"
            />
            {groups.length > 0 && (
              <Select value={newTaskGroupId} onValueChange={setNewTaskGroupId}>
                <SelectTrigger className="h-9 w-36 bg-gray-800 border-gray-700 text-white text-xs">
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
            <Button size="sm" onClick={handleAddTask} className="h-9 bg-red-600 hover:bg-red-700 text-white">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Grouped Sections */}
        <div className="space-y-3">
          {sortedGroups.map((group) => {
            const counts = getGroupCounts(group.id);
            const isExpanded = !collapsedGroups[group.id];
            return (
              <div key={group.id} className="space-y-1.5">
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
                  <div className="pl-4 space-y-1.5">
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
            <div className="space-y-1.5">
              {groups.length > 0 && (
                <div className="flex items-center gap-2 py-1.5 px-3">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Ungrouped</span>
                  <span className="text-xs text-gray-600">
                    {ungroupedTasks.filter((t) => t.is_complete).length}/{ungroupedTasks.length}
                  </span>
                </div>
              )}
              <div className={cn(groups.length > 0 && "pl-4", "space-y-1.5")}>
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