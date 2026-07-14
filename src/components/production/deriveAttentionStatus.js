/**
 * Derive a project's attention status from workflow data.
 * Pure function — no side effects, no API calls.
 *
 * Returns { status, label, color, bgClass, borderClass, sortPriority }
 */

const ATTENTION_STATUSES = {
  NEEDS_MANAGEMENT: {
    status: "NEEDS_MANAGEMENT",
    label: "Needs Management",
    color: "text-red-400",
    bgClass: "bg-red-900/20",
    borderClass: "border-red-800/40",
    dot: "#EF4444",
    sortPriority: 0,
  },
  BLOCKED: {
    status: "BLOCKED",
    label: "Blocked",
    color: "text-orange-400",
    bgClass: "bg-orange-900/20",
    borderClass: "border-orange-800/40",
    dot: "#F97316",
    sortPriority: 1,
  },
  AT_RISK: {
    status: "AT_RISK",
    label: "At Risk",
    color: "text-amber-400",
    bgClass: "bg-amber-900/20",
    borderClass: "border-amber-800/40",
    dot: "#F59E0B",
    sortPriority: 2,
  },
  WAITING_EXTERNAL: {
    status: "WAITING_EXTERNAL",
    label: "Waiting External",
    color: "text-purple-400",
    bgClass: "bg-purple-900/20",
    borderClass: "border-purple-800/40",
    dot: "#A855F7",
    sortPriority: 3,
  },
  READY_FOR_REVIEW: {
    status: "READY_FOR_REVIEW",
    label: "Ready for Review",
    color: "text-blue-400",
    bgClass: "bg-blue-900/20",
    borderClass: "border-blue-800/40",
    dot: "#3B82F6",
    sortPriority: 4,
  },
  ON_TRACK: {
    status: "ON_TRACK",
    label: "On Track",
    color: "text-emerald-400",
    bgClass: "bg-emerald-900/20",
    borderClass: "border-emerald-800/40",
    dot: "#10B981",
    sortPriority: 5,
  },
};

export function deriveAttentionStatus(project, tasks, milestones) {
  const wh = project?.workflow_health || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count task conditions
  let overdueTasks = 0;
  let waitingParts = 0;
  let waitingVendor = 0;
  let waitingCustomer = 0;
  let blockedTasks = 0;
  let reviewRequired = 0;
  let readyTasks = 0;
  let inProgressTasks = 0;

  tasks.forEach(t => {
    // Overdue check
    if (t.due_date) {
      const due = new Date(t.due_date + "T00:00:00");
      if (due < today) overdueTasks++;
    }
    // Operational state counts
    const os = t.operational_state;
    if (os === "WAITING_ON_PARTS") waitingParts++;
    else if (os === "WAITING_ON_VENDOR") waitingVendor++;
    else if (os === "WAITING_ON_CUSTOMER") waitingCustomer++;
    else if (os === "BLOCKED") blockedTasks++;
    else if (os === "REVIEW_REQUIRED") reviewRequired++;
    else if (os === "READY") readyTasks++;
    else if (os === "IN_PROGRESS") inProgressTasks++;
  });

  // Check milestone conditions
  const overdueMilestones = (milestones || []).filter(ms => {
    if (ms.status === "completed" || ms.status === "skipped") return false;
    return ms.status === "reopened";
  });

  // Has unresolved project-level blocker requiring management
  const hasProjectBlocker = !!project?.current_blocker;

  // ── NEEDS MANAGEMENT ──
  // Overdue required tasks, reopened milestones, or project-level blockers
  if (overdueTasks > 0 || overdueMilestones.length > 0 || (hasProjectBlocker && blockedTasks > 0)) {
    return ATTENTION_STATUSES.NEEDS_MANAGEMENT;
  }

  // ── BLOCKED ──
  // No executable work — everything is waiting/blocked
  const executableTasks = readyTasks + inProgressTasks;
  if (tasks.length > 0 && executableTasks === 0 && (blockedTasks > 0 || waitingParts > 0 || waitingVendor > 0)) {
    return ATTENTION_STATUSES.BLOCKED;
  }

  // ── WAITING EXTERNAL ──
  // Customer approvals or vendor dependencies dominate
  if (waitingCustomer > 0 || (waitingVendor > 0 && waitingVendor >= inProgressTasks)) {
    return ATTENTION_STATUSES.WAITING_EXTERNAL;
  }

  // ── AT RISK ──
  // Has target date approaching with significant blockers
  if (project?.target_completion) {
    const target = new Date(project.target_completion + "T00:00:00");
    const daysUntilTarget = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (daysUntilTarget <= 14 && (waitingParts > 0 || waitingVendor > 0 || blockedTasks > 0)) {
      return ATTENTION_STATUSES.AT_RISK;
    }
  }

  // ── READY FOR REVIEW ──
  if (reviewRequired > 0) {
    return ATTENTION_STATUSES.READY_FOR_REVIEW;
  }

  // ── ON TRACK ──
  return ATTENTION_STATUSES.ON_TRACK;
}

export function getAttentionSortPriority(status) {
  const cfg = ATTENTION_STATUSES[status];
  return cfg ? cfg.sortPriority : 99;
}

export { ATTENTION_STATUSES };