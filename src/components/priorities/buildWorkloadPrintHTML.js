/**
 * buildWorkloadPrintHTML(data) → string
 *
 * Pure function: accepts a complete print-data object, returns a self-contained
 * HTML string.  No window access, no storage, no routing, no React.
 *
 * The caller (click handler) owns window.open, document.write, print trigger,
 * and error handling.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtDate(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return "\u2014";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtHours(decimal) {
  if (decimal == null || decimal === "" || isNaN(decimal)) return null;
  const num = Number(decimal);
  if (num === 0) return "0m";
  const hours = Math.floor(num);
  const minutes = Math.round((num - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatPrintTimestamp() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
}

const SECTION_LABELS = {
  dueThisWeek: "DUE THIS WEEK",
  overdue: "OVERDUE",
  upcoming: "UPCOMING",
  unscheduled: "UNSCHEDULED",
  selected: "SELECTED TASKS",
};

// ── Task row ─────────────────────────────────────────────────────────────────

function renderTaskRow(task, teamMemberMap, statusMap, blockedSet, fields, data) {
  const assignee = teamMemberMap.get(task.assigned_team_member_id);
  const status = statusMap.get(task.status_id);
  const isBlocked = blockedSet.has(task.id);
  const due = parseLocalDate(task.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = due && due < today;

  // Time fields (estimate / actual blank)
  let timeHtml = "";
  if (fields.showEstimate || fields.showActualBlank) {
    timeHtml += `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;white-space:nowrap;width:140px;justify-content:flex-end;">`;
    if (fields.showEstimate) {
      timeHtml += `<span style="font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;font-size:7px;">est</span>`;
      timeHtml += `<span style="color:#374151;font-weight:500;font-size:10px;min-width:28px;text-align:right;">${fmtHours(task.estimated_hours) || "\u2014"}</span>`;
    }
    if (fields.showActualBlank) {
      timeHtml += `<span style="font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;font-size:7px;margin-left:4px;">act</span>`;
      timeHtml += `<span style="display:inline-block;border:1px solid #6b7280;width:50px;height:14px;vertical-align:middle;"></span>`;
    }
    timeHtml += `</div>`;
  }

  // Metadata row — only include toggled-on fields; skip empty rows
  const metaParts = [];
  if (fields.showAssignee) {
    metaParts.push(`<span style="font-size:12px;color:#6b7280;">${esc(assignee?.full_name || "Unassigned")}</span>`);
  }
  if (fields.showDueDate) {
    const dueStyle = isOverdue ? "font-weight:bold;color:#1f2937;" : "color:#6b7280;";
    metaParts.push(`<span style="font-size:12px;${dueStyle}">Due: ${fmtDate(task.due_date)}</span>`);
  }
  if (fields.showStatus && status) {
    metaParts.push(`<span style="font-size:12px;color:#6b7280;">${esc(status.label)}</span>`);
  }
  const metaHtml = metaParts.length > 0
    ? `<div style="display:flex;align-items:center;gap:12px;margin-top:2px;">${metaParts.join("")}</div>`
    : "";

  // Notes line
  const notesHtml = fields.showNotesLine
    ? `<div style="margin-top:2px;display:flex;align-items:center;gap:4px;">
        <span style="color:#9ca3af;flex-shrink:0;font-size:8px;">Notes:</span>
        <span style="flex:1;border-bottom:1px solid #d1d5db;height:12px;"></span>
      </div>`
    : "";

  // Name with priority / blocked indicators (gated by fields)
  const showPriority = fields.showPriority !== false; // default on
  const showBlocked = fields.showBlocked !== false;    // default on
  const nameWeight = showPriority && task.is_priority ? "font-weight:bold;" : "";
  const star = showPriority && task.is_priority ? `<span style="font-size:12px;font-weight:bold;">\u2605</span> ` : "";

  // Enhanced blocked: show "Blocked by: task name"
  let blockedHtml = "";
  if (showBlocked && isBlocked) {
    const blockLabel = (data.blockingLabels || {})[task.id];
    if (blockLabel) {
      blockedHtml = `<div style="margin-top:2px;font-size:10px;font-weight:600;color:#374151;">Blocked by: ${esc(blockLabel)}</div>`;
    } else {
      blockedHtml = `<div style="margin-top:2px;font-size:10px;font-weight:600;color:#374151;">Blocked</div>`;
    }
  }

  // Checklists — open items only by default; completed items only when explicitly requested
  let checklistHtml = "";
  if (fields.showChecklist) {
    const allItems = (data.checklistsByTaskId || {})[task.id] || [];
    const includeCompleted = fields.showCompletedChecklist;
    const visibleItems = includeCompleted ? allItems : allItems.filter(c => !c.is_complete);
    if (visibleItems.length > 0) {
      const doneCount = allItems.filter(c => c.is_complete).length;
      const summaryText = `${doneCount}/${allItems.length} complete`;
      checklistHtml = visibleItems.map(c => {
        const check = c.is_complete ? "&#9745;" : "&#9744;";
        const style = c.is_complete ? "text-decoration:line-through;color:#9ca3af;" : "";
        return `<div style="margin-left:16px;font-size:10px;${style}">${check} ${esc(c.title)}</div>`;
      }).join("");
      checklistHtml = `<div style="margin-top:2px;">${checklistHtml}<div style="margin-left:16px;font-size:9px;color:#9ca3af;margin-top:1px;">${summaryText}</div></div>`;
    }
  }

  // Completion marks
  let marksHtml = "";
  if (fields.showCompletionMarks) {
    marksHtml = `<div style="margin-top:3px;display:flex;gap:14px;font-size:9px;color:#6b7280;">
      <span>&#9744; Done</span>
      <span>&#9744; Blocked</span>
      <span>&#9744; Parts</span>
      <span>&#9744; Review</span>
    </div>`;
  }

  return `<div style="page-break-inside:avoid;">
    <div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #e5e7eb;">
      <div style="width:16px;height:16px;border:2px solid #9ca3af;border-radius:3px;margin-top:2px;flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div style="font-size:13px;line-height:1.4;word-wrap:break-word;overflow-wrap:break-word;${nameWeight}">
            ${star}${esc(task.name)}
          </div>
          ${timeHtml}
        </div>
        ${metaHtml}
        ${blockedHtml}
        ${checklistHtml}
        ${marksHtml}
        ${notesHtml}
      </div>
    </div>
  </div>`;
}

// ── Project group ────────────────────────────────────────────────────────────

function renderProjectGroup(group, teamMemberMap, statusMap, blockedSet, fields, data) {
  const { project, label, tasks } = group;
  if (!tasks || tasks.length === 0) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let estTotal = 0;
  tasks.forEach((t) => {
    if (t.estimated_hours > 0) estTotal += t.estimated_hours;
  });

  const meta = [`${tasks.length} Task${tasks.length !== 1 ? "s" : ""}`];
  if (estTotal > 0) meta.push(`${fmtHours(estTotal)} Est.`);

  const projectName = esc(project?.name || label || "No Project");
  const clientName = project?.client_name
    ? ` <span style="color:#6b7280;font-weight:normal;margin-left:8px;">\u2014 ${esc(project.client_name)}</span>`
    : "";

  // Group tasks by phase (if bucket info available)
  const buckets = (data.bucketsByProjectId || {})[project?.id] || [];
  const bucketMap = new Map();
  buckets.forEach(b => bucketMap.set(b.id, b));
  const sortedBuckets = [...buckets].sort((a, b) => (a.order || 0) - (b.order || 0));

  const byPhase = new Map();
  const unphased = [];
  tasks.forEach(t => {
    if (t.kanban_bucket_id && bucketMap.has(t.kanban_bucket_id)) {
      if (!byPhase.has(t.kanban_bucket_id)) byPhase.set(t.kanban_bucket_id, []);
      byPhase.get(t.kanban_bucket_id).push(t);
    } else {
      unphased.push(t);
    }
  });

  const hasPhases = sortedBuckets.some(b => byPhase.has(b.id));

  let bodyHtml = "";
  if (hasPhases) {
    sortedBuckets.forEach(b => {
      const pt = byPhase.get(b.id);
      if (!pt || pt.length === 0) return;
      bodyHtml += `<div style="page-break-inside:avoid;page-break-after:avoid;display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #9ca3af;margin-top:8px;margin-bottom:4px;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${b.color || '#6B7280'};"></span>
        <span style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">${esc(b.name)}</span>
        <span style="font-size:9px;color:#6b7280;">(${pt.length})</span>
      </div>`;
      bodyHtml += pt.map(t => renderTaskRow(t, teamMemberMap, statusMap, blockedSet, fields, data)).join("");
    });
    if (unphased.length > 0) {
      bodyHtml += `<div style="page-break-inside:avoid;display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #9ca3af;margin-top:8px;margin-bottom:4px;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#6B7280;"></span>
        <span style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">GENERAL / NO PHASE</span>
        <span style="font-size:9px;color:#6b7280;">(${unphased.length})</span>
      </div>`;
      bodyHtml += unphased.map(t => renderTaskRow(t, teamMemberMap, statusMap, blockedSet, fields, data)).join("");
    }
  } else {
    bodyHtml = tasks.map(t => renderTaskRow(t, teamMemberMap, statusMap, blockedSet, fields, data)).join("");
  }

  return `<div style="margin-bottom:16px;">
    <div style="page-break-inside:avoid;">
      <div style="border-bottom:2px solid black;padding-bottom:2px;margin-bottom:4px;">
        <div style="font-size:14px;font-weight:bold;">${projectName}${clientName}</div>
        <div style="font-size:11px;color:#6b7280;">${esc(meta.join(" \u2022 "))}</div>
      </div>
    </div>
    ${bodyHtml}
    <div style="margin-top:4px;margin-bottom:8px;page-break-inside:avoid;">
      <span style="color:#9ca3af;font-size:8px;">Project Notes:</span>
      <div style="border:1px solid #d1d5db;border-radius:4px;height:24px;"></div>
    </div>
  </div>`;
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function buildWorkloadPrintHTML(data) {
  const { selectedSections, sectionGroups, fields, weekLabel, activeFilters } = data;

  const teamMemberMap = new Map();
  (data.teamMembers || []).forEach((tm) => teamMemberMap.set(tm.id, tm));
  const statusMap = new Map();
  (data.statuses || []).forEach((s) => statusMap.set(s.id, s));
  const blockedSet = new Set(data.blockedTaskIds || []);

  const printedAt = formatPrintTimestamp();

  let totalTasks = 0;
  (selectedSections || []).forEach((secKey) => {
    (sectionGroups[secKey] || []).forEach((g) => {
      totalTasks += (g.tasks || []).length;
    });
  });

  let filtersHtml = "";
  if (activeFilters && activeFilters.length > 0) {
    filtersHtml = `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${esc(activeFilters.join(" \u2022 "))}</div>`;
  }

  let sectionsHtml = "";
  (selectedSections || []).forEach((secKey) => {
    const groups = sectionGroups[secKey] || [];
    const taskCount = groups.reduce((s, g) => s + (g.tasks || []).length, 0);
    if (taskCount === 0) return;

    const sectionLabel = SECTION_LABELS[secKey] || secKey;
    const groupsHtml = groups
      .map((g) => renderProjectGroup(g, teamMemberMap, statusMap, blockedSet, fields, data))
      .join("");

    sectionsHtml += `<div style="margin-bottom:24px;">
      <div style="page-break-inside:avoid;page-break-after:avoid;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #1f2937;padding-bottom:4px;margin-bottom:12px;">
        ${esc(sectionLabel)} \u2014 ${taskCount} TASK${taskCount !== 1 ? "S" : ""}
      </div>
      ${groupsHtml}
    </div>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AK Weekly Shop Workload</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 12px;
      color: #000;
      background: #fff;
      line-height: 1.4;
    }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
      @page { margin: 0.4in 0.5in; size: letter portrait; }
    }
    .print-footer { display: none; }
    @media print { .print-footer { display: block !important; } }
  </style>
</head>
<body>
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <button onclick="window.print()" style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">\u2399 Print Checklist</button>
      <button onclick="window.close()" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#4b5563;background:#fff;cursor:pointer;">Close</button>
      <span style="font-size:13px;color:#9ca3af;">${totalTasks} tasks</span>
    </div>

    <div style="margin-bottom:16px;border-bottom:2px solid black;padding-bottom:8px;">
      <h1 style="font-size:18px;font-weight:bold;letter-spacing:0.03em;">AK \u2014 WEEKLY SHOP WORKLOAD</h1>
      <div style="font-size:12px;color:#4b5563;margin-top:2px;">${esc(weekLabel)}</div>
      <div style="font-size:12px;color:#6b7280;">Printed ${esc(printedAt)}</div>
      ${filtersHtml}
    </div>

    ${sectionsHtml}

    <div class="print-footer" style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center;">
      AK Weekly Workload \u2022 ${esc(weekLabel)} \u2022 Printed ${esc(printedAt)}
    </div>
    <div class="no-print" style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      AK Weekly Workload \u2022 ${esc(weekLabel)} \u2022 ${totalTasks} tasks \u2022 Printed ${esc(printedAt)}
    </div>
  </div>
  <script>
    // Wait for the document to be fully laid out before triggering print.
    // onload fires after all inline styles/content are committed.
    // Double-rAF inside onload ensures the paint is flushed on both
    // Chrome and Safari (iPad) before the print dialog opens.
    window.onload = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          window.print();
        });
      });
    };
    // Clean up after printing — if afterprint is supported, auto-close.
    // On iPad Safari where afterprint may not fire, the window stays open
    // so the user can close manually (no premature close).
    if ('onafterprint' in window) {
      window.onafterprint = function () {
        window.close();
      };
    }
  </script>
</body>
</html>`;
}