import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { filterActiveTasks } from "@/utils/getActivePriorityTasks";

export default function ProjectPrintView() {
  const projectId = new URLSearchParams(window.location.search).get("id");

  const { data: project } = useQuery({
    queryKey: ["printProject", projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }),
    select: (data) => data[0],
    enabled: !!projectId,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["printTasks", projectId],
    queryFn: () => base44.entities.Task.filter({ project_id: projectId, is_priority: true }),
    enabled: !!projectId,
  });

  const { data: allBuckets = [] } = useQuery({
    queryKey: ["printBuckets", projectId],
    queryFn: () => base44.entities.ProjectKanbanBucket.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["printTeam"],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["printStatuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });

  // Filter out completed/done/closed/archived/cancelled tasks (matches dashboard)
  const activeTasks = useMemo(() => filterActiveTasks(allTasks, statuses), [allTasks, statuses]);

  // Sort buckets by order, group tasks
  const sections = useMemo(() => {
    const sortedBuckets = [...allBuckets].sort((a, b) => (a.order || 0) - (b.order || 0));
    const tasksByBucket = {};
    const unbucketed = [];

    activeTasks.forEach((t) => {
      if (t.kanban_bucket_id && sortedBuckets.find((b) => b.id === t.kanban_bucket_id)) {
        if (!tasksByBucket[t.kanban_bucket_id]) tasksByBucket[t.kanban_bucket_id] = [];
        tasksByBucket[t.kanban_bucket_id].push(t);
      } else {
        unbucketed.push(t);
      }
    });

    // Sort tasks by due date within each bucket
    const sortTasks = (arr) =>
      [...arr].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });

    const result = sortedBuckets
      .filter((b) => tasksByBucket[b.id]?.length > 0)
      .map((b) => ({ name: b.name, tasks: sortTasks(tasksByBucket[b.id]) }));

    if (unbucketed.length > 0) {
      result.push({ name: sortedBuckets.length > 0 ? "Unsorted" : "All Tasks", tasks: sortTasks(unbucketed) });
    }

    return result;
  }, [activeTasks, allBuckets]);

  const teamMap = useMemo(() => {
    const m = {};
    teamMembers.forEach((tm) => { m[tm.id] = tm.full_name; });
    return m;
  }, [teamMembers]);

  const formatDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const isOverdue = (d) => {
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(d) < today;
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
          @page { margin: 0.5in; }
        }
      `}</style>

      <div className="min-h-screen bg-white text-black p-8 max-w-3xl mx-auto font-sans">
        {/* Print button */}
        <div className="no-print flex items-center gap-3 mb-6">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print Checklist
          </button>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Header */}
        <h1 className="text-xl font-bold border-b-2 border-black pb-2 mb-1">
          {project.name}
        </h1>
        <div className="text-xs text-gray-500 mb-6">
          Priority Tasks (Active) • Printed {new Date().toLocaleDateString()}
          {project.client_name && ` • ${project.client_name}`}
        </div>

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.name} className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 border-b border-gray-300 pb-1 mb-2">
              {section.name}
              <span className="text-gray-400 font-normal ml-2">({section.tasks.length})</span>
            </h2>

            <div className="space-y-0">
              {section.tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2 py-1 border-b border-gray-100">
                  {/* Checkbox */}
                  <div className="w-4 h-4 border-2 border-gray-400 rounded-sm mt-0.5 shrink-0" />

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug">{task.name}</div>
                    {task.description && (
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</div>
                    )}
                  </div>

                  {/* Assigned */}
                  <div className="text-xs text-gray-500 shrink-0 w-20 text-right truncate">
                    {teamMap[task.assigned_team_member_id] || "—"}
                  </div>

                  {/* Due date */}
                  <div className={`text-xs shrink-0 w-12 text-right ${isOverdue(task.due_date) ? "font-bold" : "text-gray-500"}`}>
                    {formatDate(task.due_date) || "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {activeTasks.length === 0 && (
          <p className="text-gray-400 text-center py-8">No active priority tasks for this project.</p>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
          {project.name} • {activeTasks.length} priority tasks • {new Date().toLocaleDateString()}
        </div>
      </div>
    </>
  );
}