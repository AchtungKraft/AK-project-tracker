import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";

// Opens the existing task drawer (with its Link Part section) for one task id. No writes of its own.
export default function TaskDrawerLauncher({ taskId, projectId, onClose }) {
  const [task, setTask] = useState(null);
  useEffect(() => {
    let live = true;
    base44.entities.Task.get(taskId).then((t) => live && setTask(t));
    return () => { live = false; };
  }, [taskId]);
  if (!task) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>;
  return <TaskDetailDrawer task={task} projectId={projectId} onClose={onClose} />;
}