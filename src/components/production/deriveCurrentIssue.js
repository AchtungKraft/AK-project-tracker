/**
 * Derive the single dominant operational issue for a project.
 * Returns a plain string describing the most important problem.
 *
 * Priority order:
 * 1. Project-level blocker (from resolver)
 * 2. Most urgent task-level blocking reason
 * 3. Overdue tasks
 * 4. Waiting states (parts, vendor, customer)
 * 5. Delivery proximity
 * 6. No current issues
 */

export function deriveCurrentIssue(project, tasks, feedbackRequests) {
  const wh = project?.workflow_health || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Project-level blocker — highest priority
  if (project?.current_blocker) {
    return project.current_blocker;
  }

  // Count task states
  let overdueTasks = 0;
  let waitingParts = 0;
  let waitingVendor = 0;
  let waitingCustomer = 0;
  let blockedTasks = 0;
  let reviewRequired = 0;

  // Collect specific blocking reasons
  const partReasons = [];
  const vendorReasons = [];

  tasks.forEach(t => {
    if (t.due_date) {
      const due = new Date(t.due_date + "T00:00:00");
      if (due < today) overdueTasks++;
    }
    const os = t.operational_state;
    if (os === "WAITING_ON_PARTS") {
      waitingParts++;
      (t.blocking_reasons || []).forEach(r => {
        if (r.type === "PART" && r.label) partReasons.push(r.label);
        if (r.type === "PURCHASE_ORDER" && r.label) partReasons.push(r.label);
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

  // 2. Pending customer approvals (from feedback requests)
  const pendingApprovals = (feedbackRequests || []).filter(
    fr => fr.status === "posted"
  );
  if (pendingApprovals.length > 0 && waitingCustomer > 0) {
    const first = pendingApprovals[0];
    const typeLabel = first.request_type?.replace(/_/g, " ");
    if (pendingApprovals.length === 1) {
      return `Customer Approval Needed — ${first.title}`;
    }
    return `${pendingApprovals.length} Customer Approvals Needed`;
  }

  // 3. Waiting on specific parts
  if (waitingParts > 0) {
    const uniqueReasons = [...new Set(partReasons)];
    if (uniqueReasons.length === 1) {
      return `Waiting on ${uniqueReasons[0]}`;
    }
    if (uniqueReasons.length > 1) {
      return `Parts Needed — ${uniqueReasons.slice(0, 2).join(", ")}${uniqueReasons.length > 2 ? ` +${uniqueReasons.length - 2} more` : ""}`;
    }
    return `${waitingParts} Task${waitingParts > 1 ? "s" : ""} Waiting on Parts`;
  }

  // 4. Waiting on vendor
  if (waitingVendor > 0) {
    const uniqueReasons = [...new Set(vendorReasons)];
    if (uniqueReasons.length === 1) {
      return `Waiting on ${uniqueReasons[0]}`;
    }
    return `${waitingVendor} Task${waitingVendor > 1 ? "s" : ""} Waiting on Vendor`;
  }

  // 5. Overdue tasks
  if (overdueTasks > 0) {
    return `${overdueTasks} Overdue Task${overdueTasks > 1 ? "s" : ""}`;
  }

  // 6. Review required
  if (reviewRequired > 0) {
    return `${reviewRequired} Task${reviewRequired > 1 ? "s" : ""} Need Review`;
  }

  // 7. Blocked tasks
  if (blockedTasks > 0) {
    return `${blockedTasks} Blocked Task${blockedTasks > 1 ? "s" : ""}`;
  }

  // 8. Waiting on customer (no specific feedback request)
  if (waitingCustomer > 0) {
    return `Waiting on Customer Decision`;
  }

  // 9. Delivery proximity
  if (project?.target_completion) {
    const target = new Date(project.target_completion + "T00:00:00");
    const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) {
      return `Delivery ${Math.abs(daysLeft)} Days Past Due`;
    }
    if (daysLeft <= 7) {
      return `Delivery in ${daysLeft} Day${daysLeft > 1 ? "s" : ""}`;
    }
    if (daysLeft <= 14) {
      return `Delivery in ${daysLeft} Days`;
    }
  }

  // 10. No issues
  return null;
}

/**
 * Get the color treatment for the current issue string.
 */
export function getIssueColor(issue) {
  if (!issue) return { text: "text-emerald-400", bg: "bg-emerald-900/10" };
  const lower = issue.toLowerCase();
  if (lower.includes("overdue") || lower.includes("past due")) return { text: "text-red-400", bg: "bg-red-900/10" };
  if (lower.includes("blocked")) return { text: "text-red-400", bg: "bg-red-900/10" };
  if (lower.includes("waiting on") || lower.includes("parts needed")) return { text: "text-amber-400", bg: "bg-amber-900/10" };
  if (lower.includes("customer")) return { text: "text-blue-400", bg: "bg-blue-900/10" };
  if (lower.includes("review")) return { text: "text-violet-400", bg: "bg-violet-900/10" };
  if (lower.includes("delivery")) return { text: "text-cyan-400", bg: "bg-cyan-900/10" };
  return { text: "text-amber-400", bg: "bg-amber-900/10" };
}