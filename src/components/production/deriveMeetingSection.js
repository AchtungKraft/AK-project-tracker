/**
 * Classify projects into meeting sections:
 * 1. DISCUSSION — projects requiring management decisions
 * 2. ACTIVE — healthy projects in active production
 * 3. LOW_PRIORITY — planning, future, paused, completed
 *
 * Sorting within each section by operational urgency.
 */

const WAITING_STATES = ["WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER", "BLOCKED", "REVIEW_REQUIRED"];

const ACTIVE_PHASE_KEYWORDS = [
  "assembly", "fabrication", "interior", "exterior", "paint", "testing",
  "welding", "machining", "electrical", "bodywork", "engine", "chassis",
  "production", "install", "build", "finishing", "trim", "wiring",
  "mechanical", "suspension", "exhaust", "upholstery",
];

const LOW_PRIORITY_PHASE_KEYWORDS = [
  "planning", "design", "prototyping", "engineering", "quoting",
  "complete", "delivered", "closed", "hold", "pause",
];

function isActiveProductionPhase(phaseName) {
  if (!phaseName) return false;
  const lower = phaseName.toLowerCase();
  return ACTIVE_PHASE_KEYWORDS.some(k => lower.includes(k));
}

function isLowPriorityPhase(phaseName) {
  if (!phaseName) return false;
  const lower = phaseName.toLowerCase();
  return LOW_PRIORITY_PHASE_KEYWORDS.some(k => lower.includes(k));
}

/**
 * Determine which meeting section a project belongs to.
 * Returns "DISCUSSION" | "ACTIVE" | "LOW_PRIORITY"
 */
export function classifyMeetingSection(group) {
  const { project, tasks, currentIssue, attention } = group;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // --- DISCUSSION triggers ---

  // Has a current issue (non-null = something needs attention)
  if (currentIssue) return "DISCUSSION";

  // Attention status is not ON_TRACK
  if (attention?.status && attention.status !== "ON_TRACK") return "DISCUSSION";

  // Has waiting/blocked tasks
  const hasWaiting = tasks.some(t => WAITING_STATES.includes(t.operational_state));
  if (hasWaiting) return "DISCUSSION";

  // Has overdue tasks
  const hasOverdue = tasks.some(t => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date.length === 10 ? t.due_date + "T00:00:00" : t.due_date);
    return !isNaN(d.getTime()) && d < today;
  });
  if (hasOverdue) return "DISCUSSION";

  // Delivery within 14 days
  if (project?.target_completion) {
    const target = new Date(project.target_completion + "T00:00:00");
    if (!isNaN(target.getTime())) {
      const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 14) return "DISCUSSION";
    }
  }

  // No phase assigned but has tasks
  if (!project?.current_phase_name && tasks.length > 0) return "DISCUSSION";

  // --- LOW_PRIORITY triggers ---
  const phase = project?.current_phase_name;
  if (isLowPriorityPhase(phase)) return "LOW_PRIORITY";
  if (tasks.length === 0) return "LOW_PRIORITY";

  // No recent activity (>14 days since last workflow resolve)
  if (project?.workflow_resolved_at) {
    const resolved = new Date(project.workflow_resolved_at);
    if (!isNaN(resolved.getTime())) {
      const daysSince = Math.ceil((today - resolved) / (1000 * 60 * 60 * 24));
      if (daysSince > 14) return "LOW_PRIORITY";
    }
  }

  // --- ACTIVE production ---
  return "ACTIVE";
}

/**
 * Sort priority within the DISCUSSION section.
 * Lower = discussed first.
 */
export function getDiscussionSortPriority(group) {
  const { currentIssue, tasks, project } = group;
  const issue = (currentIssue || "").toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Customer decisions first — need external input
  if (issue.includes("customer")) return 0;
  // Parts/vendor — procurement blockers
  if (issue.includes("waiting on") || issue.includes("parts") || issue.includes("vendor")) return 1;
  // Overdue — time pressure
  if (issue.includes("overdue") || issue.includes("past due")) return 2;
  // Delivery proximity
  if (issue.includes("deliver")) return 3;
  // Data quality
  if (issue.includes("missing") || issue.includes("unassigned") || issue.includes("no active phase")) return 4;
  // Blocked/review
  if (issue.includes("blocked") || issue.includes("review") || issue.includes("engineering")) return 5;
  // Has any issue
  if (currentIssue) return 6;
  // Fallback
  return 7;
}