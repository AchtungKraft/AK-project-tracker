import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { filterActiveTasks } from "@/utils/getActivePriorityTasks";
import PrintTaskChecklistItems from "@/components/print/PrintTaskChecklistItems";
import PrintTaskPartsProgress from "@/components/print/PrintTaskPartsProgress";
import { groupIncompleteByTaskId } from "@/components/tasks/checklistHelpers";

export default function PersonPrintView() {
  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("memberId");

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["printTeam"],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const member = teamMembers.find((tm) => tm.id === memberId);

  const { data: allTasks = [] } = useQuery({
    queryKey: ["printPersonTasks", memberId],
    queryFn: () => base44.entities.Task.filter({ assigned_team_member_id: memberId, is_priority: true }),
    enabled: !!memberId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["printPersonProjects"],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: allBuckets = [] } = useQuery({
    queryKey: ["printPersonBuckets"],
    queryFn: () => base44.entities.ProjectKanbanBucket.list(),
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["printStatuses"],
    queryFn: () => base44.entities.StatusList.list(),
  });

  // Filter out completed/done/closed/archived/cancelled tasks (matches dashboard)
  const activeTasks = useMemo(() => filterActiveTasks(allTasks, statuses), [allTasks, statuses]);

  const taskIds = useMemo(() => activeTasks.map(t => t.id), [activeTasks]);

  const { data: allChecklistItems = [] } = useQuery({
    queryKey: ['taskChecklistItems', 'print', memberId],
    queryFn: () => base44.entities.TaskChecklistItem.list(),
    enabled: taskIds.length > 0,
  });

  const checklistItemsByTaskId = useMemo(() => {
    return groupIncompleteByTaskId(allChecklistItems, new Set(taskIds));
  }, [allChecklistItems, taskIds]);

  const { data: allTaskPartLinks = [] } = useQuery({
    queryKey: ['taskPartLinks', 'printPerson', memberId],
    queryFn: () => base44.entities.TaskPartLink.list(),
    enabled: taskIds.length > 0,
  });

  const taskPartLinksByTaskId = useMemo(() => {
    const map = {};
    const taskIdSet = new Set(taskIds);
    allTaskPartLinks.forEach(link => {
      if (!taskIdSet.has(link.task_id)) return;
      if (!map[link.task_id]) map[link.task_id] = [];
      map[link.task_id].push(link);
    });
    return map;
  }, [allTaskPartLinks, taskIds]);

  const projectMap = useMemo(() => {
    const m = {};
    projects.forEach((p) => { m[p.id] = p; });
    return m;
  }, [projects]);

  const bucketMap = useMemo(() => {
    const m = {};
    allBuckets.forEach((b) => { m[b.id] = b; });
    return m;
  }, [allBuckets]);

  // Group tasks: project → bucket → tasks sorted by due date
  const projectSections = useMemo(() => {
    const byProject = {};
    activeTasks.forEach((t) => {
      const pid = t.project_id || "__none__";
      if (!byProject[pid]) byProject[pid] = [];
      byProject[pid].push(t);
    });

    const sortTasks = (arr) =>
      [...arr].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });

    return Object.entries(byProject)
      .map(([pid, tasks]) => {
        const project = projectMap[pid] || { id: pid, name: "Unassigned / General" };
        const projectBuckets = allBuckets
          .filter((b) => b.project_id === pid)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        const bucketSections = [];
        const unbucketed = [];

        tasks.forEach((t) => {
          if (t.kanban_bucket_id && projectBuckets.find((b) => b.id === t.kanban_bucket_id)) {
            const existing = bucketSections.find((s) => s.bucketId === t.kanban_bucket_id);
            if (existing) {
              existing.tasks.push(t);
            } else {
              const bucket = projectBuckets.find((b) => b.id === t.kanban_bucket_id);
              bucketSections.push({
                bucketId: t.kanban_bucket_id,
                bucketName: bucket?.name || "Unknown",
                bucketOrder: bucket?.order || 0,
                tasks: [t],
              });
            }
          } else {
            unbucketed.push(t);
          }
        });

        bucketSections.sort((a, b) => a.bucketOrder - b.bucketOrder);
        bucketSections.forEach((s) => { s.tasks = sortTasks(s.tasks); });

        if (unbucketed.length > 0) {
          bucketSections.push({
            bucketId: "__unsorted__",
            bucketName: projectBuckets.length > 0 ? "Unsorted" : "",
            tasks: sortTasks(unbucketed),
          });
        }

        return { project, tasks, bucketSections };
      })
      .sort((a, b) => b.tasks.length - a.tasks.length);
  }, [activeTasks, projectMap, allBuckets]);

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

  if (!member) {
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
          {member.full_name}
        </h1>
        <div className="text-xs text-gray-500 mb-6">
          Priority Tasks (Active) • Printed {new Date().toLocaleDateString()}
          {` • ${activeTasks.length} task${activeTasks.length !== 1 ? "s" : ""}`}
        </div>

        {/* Project sections */}
        {projectSections.map(({ project, bucketSections }) => (
          <div key={project.id || project.name} className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800 border-b border-gray-400 pb-1 mb-2">
              {project.name}
            </h2>

            {bucketSections.map((section) => (
              <div key={section.bucketId} className="mb-3">
                {section.bucketName && (
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 ml-2">
                    {section.bucketName}
                    <span className="text-gray-400 font-normal ml-1">({section.tasks.length})</span>
                  </h3>
                )}

                <div className="space-y-0">
                  {section.tasks.map((task) => (
                    <div key={task.id} className="break-inside-avoid ml-2">
                      <div className="flex items-start gap-2 py-1 border-b border-gray-100">
                        <div className="w-4 h-4 border-2 border-gray-400 rounded-sm mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm leading-snug">{task.name}</div>
                          {task.description && (
                            <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</div>
                          )}
                        </div>
                        <div className={`text-xs shrink-0 w-12 text-right ${isOverdue(task.due_date) ? "font-bold" : "text-gray-500"}`}>
                          {formatDate(task.due_date) || "—"}
                        </div>
                      </div>
                      <PrintTaskPartsProgress taskId={task.id} taskPartLinksByTaskId={taskPartLinksByTaskId} />
                      <PrintTaskChecklistItems taskId={task.id} checklistItemsByTaskId={checklistItemsByTaskId} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        {activeTasks.length === 0 && (
          <p className="text-gray-400 text-center py-8">No active priority tasks for this person.</p>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
          {member.full_name} • {activeTasks.length} priority tasks • {new Date().toLocaleDateString()}
        </div>
      </div>
    </>
  );
}