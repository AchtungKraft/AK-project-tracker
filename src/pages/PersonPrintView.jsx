import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Printer, Flame } from "lucide-react";
import { filterActiveTasks } from "@/utils/getActivePriorityTasks";
import PrintTaskChecklistItems from "@/components/print/PrintTaskChecklistItems";
import PrintTaskPartsProgress from "@/components/print/PrintTaskPartsProgress";
import { groupIncompleteByTaskId } from "@/components/tasks/checklistHelpers";
import { groupTaskPartLinksByTaskId } from "@/utils/taskPartsProgress";
import { sortTasksByPriority, isUrgentPriority } from "@/utils/taskPrioritySort";

function PersonPrintBucketSection({ section, formatDate, isOverdue, isUrgent, taskPartLinksByTaskId, checklistItemsByTaskId }) {
  return (
    <div className="mb-3">
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
                <div className={`text-sm leading-snug ${task.is_priority ? 'font-bold' : ''}`}>
                  {task.is_priority && <Flame className="inline-block w-3.5 h-3.5 mr-1 text-red-500 align-text-bottom" fill="none" strokeWidth={2} />}
                  {task.name}
                </div>
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
  );
}

export default function PersonPrintView() {
  const params = new URLSearchParams(window.location.search);
  const memberId = params.get("memberId");

  // Read shared dashboard filters from localStorage (same as PriorityDashboard)
  const sharedFilters = useMemo(() => {
    try {
      const stored = localStorage.getItem('ak_shared_filters');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  }, []);
  const selectedTypes = sharedFilters.selectedTypes || [];
  const statusFilter = sharedFilters.statusFilter || 'all';

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["printTeam"],
    queryFn: () => base44.entities.TeamMember.list(),
  });

  const member = teamMembers.find((tm) => tm.id === memberId);

  const { data: allMemberTasks = [] } = useQuery({
    queryKey: ["printPersonTasks", memberId],
    queryFn: () => base44.entities.Task.filter({ assigned_team_member_id: memberId }),
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

  // Filter out completed tasks, then apply dashboard project filters (selectedTypes, statusFilter)
  const activeTasks = useMemo(() => {
    const baseActive = filterActiveTasks(allMemberTasks, statuses);
    return baseActive.filter(t => {
      const project = projects.find(p => p.id === t.project_id);
      if (selectedTypes.length > 0 && project && !selectedTypes.includes(project.project_type_id)) return false;
      if (statusFilter !== 'all' && project && project.status_id !== statusFilter) return false;
      return true;
    });
  }, [allMemberTasks, statuses, projects, selectedTypes, statusFilter]);

  const taskIds = useMemo(() => activeTasks.map(t => t.id), [activeTasks]);

  const { data: allChecklistItems = [] } = useQuery({
    queryKey: ['taskChecklistItems', 'print', memberId, taskIds],
    queryFn: () => base44.entities.TaskChecklistItem.filter({ task_id: { $in: taskIds } }),
    enabled: taskIds.length > 0,
  });

  const checklistItemsByTaskId = useMemo(() => {
    return groupIncompleteByTaskId(allChecklistItems, new Set(taskIds));
  }, [allChecklistItems, taskIds]);

  const { data: allTaskPartLinks = [] } = useQuery({
    queryKey: ['taskPartLinks', 'printPerson', memberId, taskIds],
    queryFn: () => base44.entities.TaskPartLink.filter({ task_id: { $in: taskIds } }),
    enabled: taskIds.length > 0,
  });

  const taskPartLinksByTaskId = useMemo(() => {
    return groupTaskPartLinksByTaskId(allTaskPartLinks, new Set(taskIds));
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

  // Split into urgent and upcoming, build project sections for each
  const { urgentProjectSections, upcomingProjectSections } = useMemo(() => {
    const sorted = sortTasksByPriority(activeTasks);
    const urgent = sorted.filter(isUrgentPriority);
    const upcoming = sorted.filter(t => !isUrgentPriority(t));

    const buildProjectSections = (tasks) => {
      const byProject = {};
      tasks.forEach((t) => {
        const pid = t.project_id || "__none__";
        if (!byProject[pid]) byProject[pid] = [];
        byProject[pid].push(t);
      });

      return Object.entries(byProject)
        .map(([pid, ptasks]) => {
          const project = projectMap[pid] || { id: pid, name: "Unassigned / General" };
          const projectBuckets = allBuckets
            .filter((b) => b.project_id === pid)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

          const bucketSections = [];
          const unbucketed = [];

          ptasks.forEach((t) => {
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
          bucketSections.forEach((s) => { s.tasks = sortTasksByPriority(s.tasks); });

          if (unbucketed.length > 0) {
            bucketSections.push({
              bucketId: "__unsorted__",
              bucketName: projectBuckets.length > 0 ? "Unsorted" : "",
              tasks: sortTasksByPriority(unbucketed),
            });
          }

          return { project, tasks: ptasks, bucketSections };
        })
        .sort((a, b) => b.tasks.length - a.tasks.length);
    };

    return {
      urgentProjectSections: buildProjectSections(urgent),
      upcomingProjectSections: buildProjectSections(upcoming),
    };
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
          Active Tasks • Printed {new Date().toLocaleDateString()}
          {` • ${activeTasks.length} task${activeTasks.length !== 1 ? "s" : ""}`}
          {(selectedTypes.length > 0 || statusFilter !== 'all') && ' • Filtered'}
        </div>

        {/* Urgent Priority Section */}
        {urgentProjectSections.length > 0 && urgentProjectSections.some(s => s.tasks.length > 0) && (
          <div className="mb-8">
            <div className="text-xs font-bold uppercase tracking-wider text-red-700 border-b-2 border-red-400 pb-1 mb-3">
              ⚡ CURRENT PRIORITIES (Next 14 Days)
            </div>
            {urgentProjectSections.map(({ project, bucketSections }) => (
              <div key={project.id || project.name} className="mb-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800 border-b border-gray-400 pb-1 mb-2">
                  {project.name}
                </h2>
                {bucketSections.map((section) => (
                  <PersonPrintBucketSection key={section.bucketId} section={section} formatDate={formatDate} isOverdue={isOverdue} isUrgent={true}
                    taskPartLinksByTaskId={taskPartLinksByTaskId} checklistItemsByTaskId={checklistItemsByTaskId} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* All Scheduled Work Section */}
        {upcomingProjectSections.length > 0 && upcomingProjectSections.some(s => s.tasks.length > 0) && (
          <div className="mb-6">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-600 border-b-2 border-gray-400 pb-1 mb-3">
              ALL SCHEDULED WORK
            </div>
            {upcomingProjectSections.map(({ project, bucketSections }) => (
              <div key={project.id || project.name} className="mb-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800 border-b border-gray-400 pb-1 mb-2">
                  {project.name}
                </h2>
                {bucketSections.map((section) => (
                  <PersonPrintBucketSection key={section.bucketId} section={section} formatDate={formatDate} isOverdue={isOverdue} isUrgent={false}
                    taskPartLinksByTaskId={taskPartLinksByTaskId} checklistItemsByTaskId={checklistItemsByTaskId} />
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTasks.length === 0 && (
          <p className="text-gray-400 text-center py-8">No active tasks for this person.</p>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
          {member.full_name} • {activeTasks.length} tasks • {new Date().toLocaleDateString()}
        </div>
      </div>
    </>
  );
}