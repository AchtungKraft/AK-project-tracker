import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Flame, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function ExecutionInlineTaskCreator({
  projectId,
  teamMembers = [],
  statuses = [],
  defaultStatusId,
  onCreated,
  onCancel,
}) {
  const queryClient = useQueryClient();
  const titleRef = useRef(null);
  const [showMore, setShowMore] = useState(false);
  const [taskData, setTaskData] = useState({
    name: "",
    assigned_team_member_id: "",
    due_date: "",
    is_priority: true,
    description: "",
  });

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSuccess: (newTask) => {
      queryClient.invalidateQueries({ queryKey: ['priorityTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['projectTasks'] });
      toast.success(`Task "${taskData.name}" created`);
      onCreated?.(newTask);
      // Reset for rapid entry
      setTaskData(prev => ({
        ...prev,
        name: "",
        description: "",
      }));
      setShowMore(false);
      titleRef.current?.focus();
    },
  });

  const handleSubmit = () => {
    if (!taskData.name.trim()) return;
    const payload = {
      name: taskData.name.trim(),
      project_id: projectId,
      is_priority: taskData.is_priority,
      priority_set_at: taskData.is_priority ? new Date().toISOString() : null,
    };
    if (taskData.assigned_team_member_id) payload.assigned_team_member_id = taskData.assigned_team_member_id;
    if (taskData.due_date) payload.due_date = taskData.due_date;
    if (taskData.description.trim()) payload.description = taskData.description.trim();
    if (defaultStatusId) payload.status_id = defaultStatusId;

    createMutation.mutate(payload);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const activeTeam = teamMembers.filter(tm => tm.active !== false);

  return (
    <div
      className="border border-gray-700 rounded-lg bg-gray-900/80 p-3 mb-3 space-y-2"
      onKeyDown={handleKeyDown}
    >
      {/* Row 1: Title */}
      <Input
        ref={titleRef}
        value={taskData.name}
        onChange={e => setTaskData(d => ({ ...d, name: e.target.value }))}
        placeholder="Task title…"
        className="bg-gray-800 border-gray-700 text-white h-8 text-sm"
      />

      {/* Row 2: Compact fields */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={taskData.assigned_team_member_id}
          onChange={e => setTaskData(d => ({ ...d, assigned_team_member_id: e.target.value }))}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none min-w-[120px]"
        >
          <option value="">Unassigned</option>
          {activeTeam.map(tm => (
            <option key={tm.id} value={tm.id}>{tm.full_name}</option>
          ))}
        </select>

        <input
          type="date"
          value={taskData.due_date}
          onChange={e => setTaskData(d => ({ ...d, due_date: e.target.value }))}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none"
        />

        <button
          type="button"
          onClick={() => setTaskData(d => ({ ...d, is_priority: !d.is_priority }))}
          className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded border transition-colors ${
            taskData.is_priority
              ? 'border-red-600 bg-red-900/40 text-red-400'
              : 'border-gray-700 bg-gray-800 text-gray-500'
          }`}
          title="Toggle priority"
        >
          <Flame className="w-3 h-3" />
          Priority
        </button>

        <button
          type="button"
          onClick={() => setShowMore(v => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-0.5 ml-auto"
        >
          {showMore ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          More
        </button>
      </div>

      {/* Row 3: Optional description */}
      {showMore && (
        <Textarea
          value={taskData.description}
          onChange={e => setTaskData(d => ({ ...d, description: e.target.value }))}
          placeholder="Description (optional)"
          className="bg-gray-800 border-gray-700 text-white text-sm min-h-[60px]"
        />
      )}

      {/* Row 4: Actions */}
      <div className="flex items-center gap-2 justify-end">
        <span className="text-[10px] text-gray-600 mr-auto">Enter to create · Esc to cancel</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="border-gray-700 text-gray-400 h-7 text-xs"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!taskData.name.trim() || createMutation.isPending}
          className="bg-red-600 hover:bg-red-700 h-7 text-xs"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : null}
          Create Task
        </Button>
      </div>
    </div>
  );
}