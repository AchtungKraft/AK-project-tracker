/**
 * useWorkloadData — transforms raw task/project data into workload sections.
 * Reads persisted operational_state from tasks. Does NOT call the resolver.
 */
import { useMemo } from "react";
import { startOfDay, startOfWeek, endOfWeek, addDays, subHours } from "date-fns";
import { sortTasksByPriority } from "@/utils/taskPrioritySort";
import { WORKLOAD_SECTIONS, COMPLETED_WINDOWS } from "./workloadConfig";

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Classify a task's date context for filtering.
 */
function getDateContext(task) {
  const due = parseLocalDate(task.due_date);
  if (!due) return "unscheduled";
  const today = startOfDay(new Date());
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  
  if (due < today) return "overdue";
  if (due <= todayEnd) return "today";
  if (due <= weekEnd) return "this_week";
  return "upcoming";
}

/**
 * Build successor map: taskId → count of tasks that depend on it.
 */
function buildSuccessorCounts(allTasks) {
  const counts = {};
  allTasks.forEach(task => {
    if (task.dependencies?.length) {
      task.dependencies.forEach(depId => {
        counts[depId] = (counts[depId] || 0) + 1;
      });
    }
  });
  return counts;
}

export default function useWorkloadData({
  tasks,
  allTasks,
  projects,
  phases,
  teamMembers,
  statuses,
  dateFilter = "all",
  completedWindow = "7d",
  filters = {},
}) {
  // Build lookup maps
  const projectMap = useMemo(() => {
    const m = new Map();
    projects.forEach(p => m.set(p.id, p));
    return m;
  }, [projects]);

  const phaseMap = useMemo(() => {
    const m = new Map();
    phases.forEach(p => m.set(p.id, p));
    return m;
  }, [phases]);

  const teamMemberMap = useMemo(() => {
    const m = new Map();
    teamMembers.forEach(tm => m.set(tm.id, tm));
    return m;
  }, [teamMembers]);

  const statusMap = useMemo(() => {
    const m = new Map();
    statuses.forEach(s => m.set(s.id, s));
    return m;
  }, [statuses]);

  // Phases grouped by project for phase sub-grouping
  const phasesByProject = useMemo(() => {
    const m = new Map();
    phases.forEach(p => {
      if (!m.has(p.project_id)) m.set(p.project_id, []);
      m.get(p.project_id).push(p);
    });
    // Sort each project's phases by order
    m.forEach((arr) => arr.sort((a, b) => (a.order || 0) - (b.order || 0)));
    return m;
  }, [phases]);

  // Successor counts for downstream display
  const successorCounts = useMemo(() => buildSuccessorCounts(allTasks.length > 0 ? allTasks : tasks), [allTasks, tasks]);

  // Completed status ID detection
  const completedStatusId = useMemo(() => {
    const s = statuses.find(s => s.scope === "Task" && s.active && /complete|done/i.test(s.label));
    return s?.id;
  }, [statuses]);

  // Completed window cutoff
  const completedCutoff = useMemo(() => {
    const cfg = COMPLETED_WINDOWS.find(w => w.key === completedWindow) || COMPLETED_WINDOWS[1];
    return subHours(new Date(), cfg.hours);
  }, [completedWindow]);

  // Classify tasks into sections
  const { sections, stats, staleProjects, staleMissingSet } = useMemo(() => {
    const sectionMap = {};
    WORKLOAD_SECTIONS.forEach(sec => { sectionMap[sec.key] = []; });

    const staleProjectIds = new Set();
    const staleMissingIds = new Set();
    let totalActive = 0;
    let overdueCount = 0;
    let unassignedCount = 0;
    let totalEstHours = 0;

    // Active task filter set
    const activeTasks = tasks.filter(t => {
      // Apply filters
      if (filters.projectId && t.project_id !== filters.projectId) return false;
      if (filters.phaseId && t.kanban_bucket_id !== filters.phaseId) return false;
      if (filters.technicianId && t.assigned_team_member_id !== filters.technicianId) return false;
      if (filters.hasPriority && !t.is_priority) return false;
      if (filters.hasBlockers && (!t.blocking_reasons || t.blocking_reasons.length === 0)) return false;
      if (filters.blocksDownstream && !successorCounts[t.id]) return false;
      if (filters.unassigned && t.assigned_team_member_id) return false;
      
      // Date filter
      if (dateFilter !== "all") {
        if (dateFilter === "7d") {
          // Show overdue + next 7 calendar days
          const due = parseLocalDate(t.due_date);
          if (!due) return true; // include unscheduled in 7d view
          const today = startOfDay(new Date());
          const cutoff = addDays(today, 7);
          if (due > cutoff) return false; // beyond 7 days
        } else {
          const ctx = getDateContext(t);
          if (dateFilter === "overdue" && ctx !== "overdue") return false;
          if (dateFilter === "today" && ctx !== "today") return false;
          if (dateFilter === "this_week" && ctx !== "this_week" && ctx !== "today") return false;
          if (dateFilter === "upcoming" && ctx !== "upcoming") return false;
          if (dateFilter === "unscheduled" && ctx !== "unscheduled") return false;
        }
      }

      return true;
    });

    activeTasks.forEach(task => {
      const opState = task.operational_state;
      const isCompleted = opState === "COMPLETED" || task.status_id === completedStatusId;

      if (isCompleted) {
        // Recently completed filter
        const completedAt = task.completed_date ? new Date(task.completed_date) : null;
        if (completedAt && completedAt >= completedCutoff) {
          sectionMap.COMPLETED.push(task);
        }
        return;
      }

      totalActive++;
      if (task.estimated_hours > 0) totalEstHours += task.estimated_hours;
      if (!task.assigned_team_member_id) unassignedCount++;
      
      const dateCtx = getDateContext(task);
      if (dateCtx === "overdue") overdueCount++;

      // Check for stale workflow data:
      // 1. operational_state is missing
      // 2. state_resolved_at is absent
      // 3. project workflow_resolved_at is older than task updated_date
      if (!opState || !task.state_resolved_at) {
        staleProjectIds.add(task.project_id);
        staleMissingIds.add(task.project_id);
      } else {
        const proj = projectMap.get(task.project_id);
        if (proj && proj.workflow_resolved_at && task.updated_date) {
          const resolved = new Date(proj.workflow_resolved_at);
          const updated = new Date(task.updated_date);
          if (updated > resolved) {
            staleProjectIds.add(task.project_id);
          }
        }
      }

      // Route to section by operational state
      const sectionKey = opState || "NOT_STARTED";
      if (sectionMap[sectionKey]) {
        sectionMap[sectionKey].push(task);
      } else {
        // Unknown state → NOT_STARTED
        sectionMap.NOT_STARTED.push(task);
      }
    });

    // Build section objects with project grouping
    const builtSections = WORKLOAD_SECTIONS.map(sec => {
      const sectionTasks = sortTasksByPriority(sectionMap[sec.key]);
      
      // Group by project
      const projectGroups = new Map();
      sectionTasks.forEach(task => {
        const pid = task.project_id || "__no_project__";
        if (!projectGroups.has(pid)) {
          projectGroups.set(pid, { project: projectMap.get(pid) || null, tasks: [] });
        }
        projectGroups.get(pid).tasks.push(task);
      });

      // Sort project groups by name
      const sortedGroups = Array.from(projectGroups.entries())
        .sort((a, b) => {
          if (a[0] === "__no_project__") return 1;
          if (b[0] === "__no_project__") return -1;
          return (a[1].project?.name || "").localeCompare(b[1].project?.name || "");
        })
        .map(([pid, g]) => {
          // Sub-group by phase within project
          const byPhase = new Map();
          const noPhaseTasks = [];
          g.tasks.forEach(t => {
            if (t.kanban_bucket_id) {
              if (!byPhase.has(t.kanban_bucket_id)) byPhase.set(t.kanban_bucket_id, []);
              byPhase.get(t.kanban_bucket_id).push(t);
            } else {
              noPhaseTasks.push(t);
            }
          });

          // Order phases by phase order
          const projectPhases = phasesByProject.get(pid) || [];
          const phaseGroups = projectPhases
            .filter(p => byPhase.has(p.id))
            .map(p => ({ phase: p, tasks: sortTasksByPriority(byPhase.get(p.id)) }));

          return {
            projectId: pid,
            project: g.project,
            tasks: g.tasks,
            phaseGroups,
            unphased: sortTasksByPriority(noPhaseTasks),
          };
        });

      return {
        ...sec,
        tasks: sectionTasks,
        count: sectionTasks.length,
        projectGroups: sortedGroups,
      };
    });

    return {
      sections: builtSections,
      stats: {
        totalActive,
        overdue: overdueCount,
        unassigned: unassignedCount,
        totalEstHours,
        inProgress: sectionMap.IN_PROGRESS.length,
        ready: sectionMap.READY.length,
        blocked: sectionMap.BLOCKED.length +
          sectionMap.WAITING_ON_PARTS.length +
          sectionMap.WAITING_ON_VENDOR.length +
          sectionMap.WAITING_ON_CUSTOMER.length,
        review: sectionMap.REVIEW_REQUIRED.length,
        completed: sectionMap.COMPLETED.length,
      },
      staleProjects: Array.from(staleProjectIds),
      staleMissingSet: staleMissingIds,
    };
  }, [tasks, dateFilter, completedWindow, completedCutoff, completedStatusId, filters, projectMap, phasesByProject, successorCounts, phaseMap]);

  return {
    sections,
    stats,
    staleProjects,
    staleMissingSet,
    projectMap,
    phaseMap,
    teamMemberMap,
    statusMap,
    successorCounts,
    phasesByProject,
  };
}