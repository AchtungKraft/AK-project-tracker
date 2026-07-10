/**
 * Generates a self-contained HTML string for the workload print view.
 * Written directly to a new window via document.write — no React, no auth,
 * no localStorage, no routing needed.
 */

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtDate(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return "—";
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

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
};

function renderTaskRow(task, teamMemberMap, statusMap, blockedSet, fields) {
  const assignee = teamMemberMap.get(task.assigned_team_member_id);
  const status = statusMap.get(task.status_id);
  const isBlocked = blockedSet.has(task.id);
  const due = parseLocalDate(task.due_date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = due && due < today;

  let timeHtml = "";
  if (fields.showEstimate || fields.showActualBlank) {
    timeHtml += `<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;white-space:nowrap;width:140px;justify-content:flex-end;">`;
    if (fields.showEstimate) {
      timeHtml += `<span style="font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;font-size:7px;">est</span>`;
      timeHtml += `<span style="color:#374151;font-weight:500;font-size:10px;min-width:28px;text-align:right;">${fmtHours(task.estimated_hours) || "—"}</span>`;
    }
    if (fields.showActualBlank) {
      timeHtml += `<span style="font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;font-size:7px;margin-left:4px;">act</span>`;
      timeHtml += `<span style="display:inline-block;border:1px solid #6b7280;width:50px;height:14px;vertical-align:middle;"></span>`;
    }
    timeHtml += `</div>`;
  }

  let metaHtml = `<div style="display:flex;align-items:center;gap:12px;margin-top:2px;">`;
  if (fields.showAssignee) {
    metaHtml += `<span style="font-size:12px;color:#6b7280;">${esc(assignee?.full_name || "Unassigned")}</span>`;
  }
  if (fields.showDueDate) {
    const dueStyle = isOverdue ? "font-weight:bold;color:#1f2937;" : "color:#6b7280;";
    metaHtml += `<span style="font-size:12px;${dueStyle}">Due: ${fmtDate(task.due_date)}</span>`;
  }
  if (status) {
    metaHtml += `<span style="font-size:12px;color:#6b7280;">${esc(status.label)}</span>`;
  }
  metaHtml += `</div>`;

  let notesHtml = "";
  if (fields.showNotesLine) {
    notesHtml = `<div style="margin-top:2px;display:flex;align-items:center;gap:4px;">
      <span style="color:#9ca3af;flex-shrink:0;font-size:8px;">Notes:</span>
      <span style="flex:1;border-bottom:1px solid #d1d5db;height:12px;"></span>
    </div>`;
  }

  const nameWeight = task.is_priority ? "font-weight:bold;" : "";
  const star = task.is_priority ? `<span style="font-size:12px;font-weight:bold;">★</span> ` : "";
  const blocked = isBlocked ? ` <span style="font-size:10px;font-weight:600;border:1px solid #9ca3af;border-radius:3px;padding:0 4px;margin-left:4px;">BLOCKED</span>` : "";

  return `<div style="page-break-inside:avoid;">
    <div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid #e5e7eb;">
      <div style="width:16px;height:16px;border:2px solid #9ca3af;border-radius:3px;margin-top:2px;flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div style="font-size:13px;line-height:1.4;display:flex;align-items:center;gap:4px;${nameWeight}">
            ${star}${esc(task.name)}${blocked}
          </div>
          ${timeHtml}
        </div>
        ${metaHtml}
        ${notesHtml}
      </div>
    </div>
  </div>`;
}

function renderProjectGroup(group, teamMemberMap, statusMap, blockedSet, fields) {
  const { project, label, tasks } = group;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let estTotal = 0, overdueCount = 0, unassignedCount = 0;
  tasks.forEach((t) => {
    if (t.estimated_hours > 0) estTotal += t.estimated_hours;
    const d = parseLocalDate(t.due_date);
    if (d && d < today) overdueCount++;
    if (!t.assigned_team_member_id) unassignedCount++;
  });

  const meta = [`${tasks.length} Task${tasks.length !== 1 ? "s" : ""}`];
  if (overdueCount > 0) meta.push(`${overdueCount} Overdue`);
  if (unassignedCount > 0) meta.push(`${unassignedCount} Unassigned`);
  if (estTotal > 0) meta.push(`${fmtHours(estTotal)} Est.`);

  const projectName = esc(project?.name || label || "No Project");
  const clientName = project?.client_name ? ` <span style="color:#6b7280;font-weight:normal;margin-left:8px;">— ${esc(project.client_name)}</span>` : "";

  const tasksHtml = tasks.map((t) => renderTaskRow(t, teamMemberMap, statusMap, blockedSet, fields)).join("");

  return `<div style="margin-bottom:16px;page-break-inside:avoid;">
    <div style="border-bottom:2px solid black;padding-bottom:2px;margin-bottom:4px;">
      <div style="font-size:13px;font-weight:bold;">${projectName}${clientName}</div>
      <div style="font-size:12px;color:#6b7280;">${esc(meta.join(" • "))}</div>
    </div>
    ${tasksHtml}
    <div style="margin-top:4px;margin-bottom:8px;">
      <span style="color:#9ca3af;font-size:8px;">Project Notes:</span>
      <div style="border:1px solid #d1d5db;border-radius:4px;height:24px;"></div>
    </div>
  </div>`;
}

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
    (sectionGroups[secKey] || []).forEach((g) => { totalTasks += g.tasks.length; });
  });

  let filtersHtml = "";
  if (activeFilters && activeFilters.length > 0) {
    filtersHtml = `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${esc(activeFilters.join(" • "))}</div>`;
  }

  let sectionsHtml = "";
  (selectedSections || []).forEach((secKey) => {
    const groups = sectionGroups[secKey] || [];
    const taskCount = groups.reduce((s, g) => s + g.tasks.length, 0);
    if (taskCount === 0) return;

    const sectionLabel = SECTION_LABELS[secKey] || secKey;
    const groupsHtml = groups.map((g) => renderProjectGroup(g, teamMemberMap, statusMap, blockedSet, fields)).join("");

    sectionsHtml += `<div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #1f2937;padding-bottom:4px;margin-bottom:12px;">
        ${esc(sectionLabel)} — ${taskCount} TASK${taskCount !== 1 ? "S" : ""}
      </div>
      ${groupsHtml}
    </div>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AK Weekly Workload — ${esc(weekLabel)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #000; background: #fff; }
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
      <button onclick="window.print()" style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">⎙ Print Checklist</button>
      <button onclick="window.close()" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#4b5563;background:#fff;cursor:pointer;">Close</button>
      <span style="font-size:13px;color:#9ca3af;">${totalTasks} tasks</span>
    </div>

    <div style="margin-bottom:16px;border-bottom:2px solid black;padding-bottom:8px;">
      <h1 style="font-size:18px;font-weight:bold;letter-spacing:0.03em;">AK — WEEKLY SHOP WORKLOAD</h1>
      <div style="font-size:12px;color:#4b5563;margin-top:2px;">${esc(weekLabel)}</div>
      <div style="font-size:12px;color:#6b7280;">Printed ${esc(printedAt)}</div>
      ${filtersHtml}
    </div>

    ${sectionsHtml}

    <div class="print-footer" style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center;">
      AK Weekly Workload • ${esc(weekLabel)} • Printed ${esc(printedAt)}
    </div>
    <div class="no-print" style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
      AK Weekly Workload • ${esc(weekLabel)} • ${totalTasks} tasks • Printed ${esc(printedAt)}
    </div>
  </div>
  <script>
    // Auto-print after a brief delay for rendering
    setTimeout(function() { window.print(); }, 500);
  </script>
</body>
</html>`;
}