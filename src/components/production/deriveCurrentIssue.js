/**
 * Derive the single dominant operational issue for a project.
 * Returns a plain string describing the SPECIFIC operational problem.
 *
 * V4: Never returns generic messages like "No Current Issues" or "1 Overdue Task".
 * Instead surfaces the actual operational blocker or data quality issue.
 *
 * Priority order:
 * 1. Project-level blocker (from resolver)
 * 2. Customer approval with specific title
 * 3. Specific parts/vendor blocking reasons
 * 4. Overdue tasks (named)
 * 5. Delivery proximity
 * 6. Data quality issues (missing phase, dates, estimates, assignees)
 * 7. null = no issues
 */

export function deriveCurrentIssue(project, tasks, feedbackRequests) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Project-level blocker — highest priority, already specific
  if (project?.current_blocker) {
    return project.current_blocker;
  }

  // Collect task data
  let overdueTasks = [];
  let waitingParts = 0;
  let waitingVendor = 0;
  let waitingCustomer = 0;
  let blockedTasks = 0;
  let reviewRequired = 0;
  let missingDueDates = 0;
  let missingEstimates = 0;
  let missingAssignees = 0;

  const partReasons = [];
  const vendorReasons = [];

  tasks.forEach(t => {
    if (t.due_date) {
      const due = new Date(t.due_date.length === 10 ? t.due_date + "T00:00:00" : t.due_date);
      if (!isNaN(due.getTime()) && due < today) overdueTasks.push(t);
    } else {
      missingDueDates++;
    }
    if (!t.estimated_hours) missingEstimates++;
    if (!t.assigned_team_member_id) missingAssignees++;

    const os = t.operational_state;
    if (os === "WAITING_ON_PARTS") {
      waitingParts++;
      (t.blocking_reasons || []).forEach(r => {
        if ((r.type === "PART" || r.type === "PURCHASE_ORDER") && r.label) partReasons.push(r.label);
      });
    }
    if (os === "WAITING_ON_VENDOR") {
      waitingVendor++;
      (t.blocking_reasons || []).forEach(r => {
        if (r.label) vendorReasons.push(r.label);
      });
    }
    if (os === "WAITING_ON_CUSTOMER") waitingCustomer++;
    if (os === "BLOCKED") blockedTasks++;
    if (os === "REVIEW_REQUIRED") reviewRequired++;
  });

  // 2. Pending customer approvals — use specific title
  const pendingApprovals = (feedbackRequests || []).filter(fr => fr.status === "posted");
  if (pendingApprovals.length > 0 && waitingCustomer > 0) {
    const first = pendingApprovals[0];
    if (pendingApprovals.length === 1) {
      return `Customer — ${first.title}`;
    }
    return `Customer — ${pendingApprovals.map(p => p.title).slice(0, 2).join(", ")}`;
  }

  // 3. Waiting on specific parts — use the actual part names
  if (waitingParts > 0) {
    const unique = [...new Set(partReasons)];
    if (unique.length >= 1) {
      return `Waiting on ${unique.slice(0, 2).join(", ")}${unique.length > 2 ? ` +${unique.length - 2}` : ""}`;
    }
    return "Missing Parts Order";
  }

  // 4. Waiting on vendor — use specific reasons
  if (waitingVendor > 0) {
    const unique = [...new Set(vendorReasons)];
    if (unique.length >= 1) {
      return `Waiting on ${unique.slice(0, 2).join(", ")}`;
    }
    return "Vendor ETA Required";
  }

  // 5. Customer waiting without specific feedback request
  if (waitingCustomer > 0) {
    return "Waiting on Customer Decision";
  }

  // 6. Overdue tasks — name the most important one
  if (overdueTasks.length > 0) {
    const sorted = overdueTasks.sort((a, b) => {
      if (a.is_priority && !b.is_priority) return -1;
      if (!a.is_priority && b.is_priority) return 1;
      return (a.due_date || "").localeCompare(b.due_date || "");
    });
    const first = sorted[0];
    if (overdueTasks.length === 1) {
      return `Overdue — ${first.name}`;
    }
    return `Overdue — ${first.name} +${overdueTasks.length - 1} more`;
  }

  // 7. Review required
  if (reviewRequired > 0) {
    return "Engineering Review Required";
  }

  // 8. Blocked tasks
  if (blockedTasks > 0) {
    const blockedTask = tasks.find(t => t.operational_state === "BLOCKED");
    const reason = blockedTask?.blocking_reasons?.[0]?.label;
    return reason ? `Blocked — ${reason}` : "Shop Coordination Required";
  }

  // 9. Delivery proximity
  if (project?.target_completion) {
    const target = new Date(project.target_completion + "T00:00:00");
    if (!isNaN(target.getTime())) {
      const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) return `Vehicle Delivers ${Math.abs(daysLeft)} Days Past Due`;
      if (daysLeft <= 3) return `Vehicle Delivers in ${daysLeft} Day${daysLeft > 1 ? "s" : ""}`;
      if (daysLeft <= 7) return `Delivery This Week`;
    }
  }

  // 10. Data quality issues — surface as actionable
  if (!project?.current_phase_name && tasks.length > 0) {
    return "No Active Phase";
  }
  if (tasks.length > 0 && missingDueDates > tasks.length * 0.5) {
    return `${missingDueDates} Tasks Missing Due Dates`;
  }
  if (tasks.length > 0 && missingEstimates > tasks.length * 0.5) {
    return `${missingEstimates} Tasks Missing Estimates`;
  }
  if (tasks.length > 0 && missingAssignees > tasks.length * 0.5) {
    return `${missingAssignees} Tasks Unassigned`;
  }

  // No issues
  return null;
}

/**
 * Get the color treatment for the current issue string.
 */
export function getIssueColor(issue) {
  if (!issue) return { text: "text-emerald-400", bg: "bg-emerald-900/10" };
  const lower = issue.toLowerCase();
  if (lower.includes("overdue") || lower.includes("past due")) return { text: "text-red-400", bg: "bg-red-900/10" };
  if (lower.includes("blocked") || lower.includes("shop coordination")) return { text: "text-red-400", bg: "bg-red-900/10" };
  if (lower.includes("waiting on") || lower.includes("parts") || lower.includes("missing parts")) return { text: "text-amber-400", bg: "bg-amber-900/10" };
  if (lower.includes("customer")) return { text: "text-blue-400", bg: "bg-blue-900/10" };
  if (lower.includes("vendor") || lower.includes("eta")) return { text: "text-purple-400", bg: "bg-purple-900/10" };
  if (lower.includes("review") || lower.includes("engineering")) return { text: "text-violet-400", bg: "bg-violet-900/10" };
  if (lower.includes("deliver")) return { text: "text-cyan-400", bg: "bg-cyan-900/10" };
  if (lower.includes("missing") || lower.includes("unassigned") || lower.includes("no active phase")) return { text: "text-yellow-400", bg: "bg-yellow-900/10" };
  return { text: "text-amber-400", bg: "bg-amber-900/10" };
}