/**
 * buildProjectWorkPacketHTML(data) → string
 *
 * Generates a clean, black-and-white project work packet for shop technicians.
 * Groups tasks by phase, shows blocking reasons, dependency unlocks,
 * optional checklists, and technician annotation fields.
 */

function esc(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "\u2014";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "\u2014";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtHours(h) {
  if (!h) return null;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function formatTimestamp() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${hours}:${minutes} ${ampm}`;
}

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

export default function buildProjectWorkPacketHTML(data) {
  const {
    project,
    tasks,
    buckets = [],
    teamMemberMap = new Map(),
    blockingLabels = {},
    blockedSet = new Set(),
    successorMap = new Map(),
    checklistsByTaskId = {},
    weekLabel = "",
    options = {},
  } = data;

  const { includeChecklists = false, includeCompletionMarks = true, includeNotes = true } = options;
  const printedAt = formatTimestamp();

  // Group by phase
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

  function renderTask(task) {
    const assignee = teamMemberMap.get(task.assigned_team_member_id);
    const isBlocked = blockedSet.has(task.id);
    const blockLabel = blockingLabels[task.id];
    const successors = successorMap.get(task.id) || [];
    const checklist = checklistsByTaskId[task.id] || [];
    const checkDone = checklist.filter(c => c.is_complete).length;
    const checkTotal = checklist.length;

    let metaParts = [];
    if (task.due_date) metaParts.push(`Due: ${fmtDate(task.due_date)}`);
    if (assignee) metaParts.push(`Assigned: ${esc(assignee.full_name)}`);
    if (fmtHours(task.estimated_hours)) metaParts.push(`Est: ${fmtHours(task.estimated_hours)}`);
    if (checkTotal > 0) metaParts.push(`Checklist: ${checkDone}/${checkTotal}`);

    let blockHtml = "";
    if (isBlocked && blockLabel) {
      blockHtml = `<div style="margin-top:2px;font-size:11px;font-weight:600;color:#374151;">BLOCKED \u2014 ${esc(blockLabel)}</div>`;
    }

    let unlocksHtml = "";
    if (successors.length > 0) {
      const names = successors.map(s => esc(s.name)).join(", ");
      unlocksHtml = `<div style="margin-top:2px;font-size:10px;color:#6b7280;">Unlocks: ${names}</div>`;
    }

    let checklistHtml = "";
    if (includeChecklists && checklist.length > 0) {
      const items = checklist.map(c => {
        const check = c.is_complete ? "&#9745;" : "&#9744;";
        const style = c.is_complete ? "text-decoration:line-through;color:#9ca3af;" : "";
        return `<div style="margin-left:20px;font-size:11px;${style}">${check} ${esc(c.title)}</div>`;
      }).join("");
      checklistHtml = `<div style="margin-top:3px;">${items}</div>`;
    }

    let marksHtml = "";
    if (includeCompletionMarks) {
      marksHtml = `<div style="margin-top:4px;display:flex;gap:16px;font-size:10px;color:#6b7280;">
        <span>&#9744; Completed</span>
        <span>&#9744; Blocked</span>
        <span>&#9744; Needs Parts</span>
        <span>&#9744; Needs Review</span>
      </div>`;
    }

    let notesHtml = "";
    if (includeNotes) {
      notesHtml = `<div style="margin-top:3px;display:flex;align-items:center;gap:4px;">
        <span style="color:#9ca3af;font-size:8px;flex-shrink:0;">Notes:</span>
        <span style="flex:1;border-bottom:1px solid #d1d5db;height:12px;"></span>
      </div>`;
    }

    const priority = task.is_priority ? `<span style="font-size:12px;">&#9733;</span> ` : "";

    return `<div style="page-break-inside:avoid;padding:4px 0;border-bottom:1px solid #e5e7eb;">
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <div style="width:16px;height:16px;border:2px solid #9ca3af;border-radius:3px;margin-top:2px;flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:${task.is_priority ? 'bold' : 'normal'};line-height:1.4;">
            ${priority}${esc(task.name)}
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:1px;">
            ${metaParts.map(p => `<span style="font-size:11px;color:#6b7280;">${esc(p)}</span>`).join("")}
          </div>
          ${blockHtml}
          ${unlocksHtml}
          ${checklistHtml}
          ${marksHtml}
          ${notesHtml}
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          <span style="font-size:7px;color:#9ca3af;text-transform:uppercase;">est</span>
          <span style="font-size:10px;color:#374151;min-width:24px;text-align:right;">${fmtHours(task.estimated_hours) || "\u2014"}</span>
          <span style="font-size:7px;color:#9ca3af;text-transform:uppercase;margin-left:4px;">act</span>
          <span style="display:inline-block;border:1px solid #6b7280;width:40px;height:14px;"></span>
        </div>
      </div>
    </div>`;
  }

  function renderPhaseGroup(name, color, phaseTasks) {
    if (phaseTasks.length === 0) return "";
    const openCount = phaseTasks.filter(t => t.status_id !== DONE_STATUS_ID).length;
    const doneCount = phaseTasks.length - openCount;
    const stats = doneCount > 0 ? `${openCount} OPEN \u00B7 ${doneCount} DONE` : `${openCount} OPEN`;
    return `<div style="margin-bottom:12px;">
      <div style="page-break-inside:avoid;page-break-after:avoid;">
        <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1.5px solid #374151;margin-bottom:4px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color || '#6B7280'};"></span>
          <span style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">${esc(name)}</span>
          <span style="font-size:10px;color:#6b7280;margin-left:auto;">${stats}</span>
        </div>
      </div>
      ${phaseTasks.map(renderTask).join("")}
    </div>`;
  }

  let phasesHtml = "";
  sortedBuckets.forEach(b => {
    const pt = byPhase.get(b.id);
    if (pt && pt.length > 0) {
      phasesHtml += renderPhaseGroup(b.name, b.color, pt);
    }
  });
  if (unphased.length > 0) {
    phasesHtml += renderPhaseGroup("Unassigned Phase", "#6B7280", unphased);
  }

  const projectName = esc(project?.name || "Unknown Project");
  const clientName = project?.client_name ? ` \u2014 ${esc(project.client_name)}` : "";
  const totalOpen = tasks.filter(t => t.status_id !== DONE_STATUS_ID).length;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${projectName} — Work Packet</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 12px; color: #000; background: #fff; line-height: 1.4; }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; -webkit-print-color-adjust: exact; }
      @page { margin: 0.4in 0.5in; size: letter portrait; }
    }
  </style>
</head>
<body>
  <div style="max-width:720px;margin:0 auto;padding:24px;">
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <button onclick="window.print()" style="display:flex;align-items:center;gap:8px;padding:8px 16px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">&#9113; Print Work Packet</button>
      <button onclick="window.close()" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#4b5563;background:#fff;cursor:pointer;">Close</button>
      <span style="font-size:13px;color:#9ca3af;">${tasks.length} tasks</span>
    </div>

    <div style="border-bottom:3px solid black;padding-bottom:8px;margin-bottom:16px;">
      <h1 style="font-size:18px;font-weight:bold;">${projectName}${clientName}</h1>
      ${weekLabel ? `<div style="font-size:12px;color:#4b5563;">${esc(weekLabel)}</div>` : ""}
      <div style="font-size:11px;color:#6b7280;">Printed ${esc(printedAt)} \u00B7 ${totalOpen} open tasks</div>
      <div style="margin-top:8px;display:flex;gap:24px;">
        <div style="flex:1;">
          <span style="font-size:9px;color:#9ca3af;text-transform:uppercase;">Technician / Name</span>
          <div style="border-bottom:1px solid #374151;height:20px;"></div>
        </div>
        <div style="flex:1;">
          <span style="font-size:9px;color:#9ca3af;text-transform:uppercase;">Date</span>
          <div style="border-bottom:1px solid #374151;height:20px;"></div>
        </div>
      </div>
    </div>

    ${phasesHtml}

    <div style="margin-top:20px;page-break-inside:avoid;">
      <span style="font-size:9px;color:#9ca3af;text-transform:uppercase;">General Notes</span>
      <div style="border:1px solid #d1d5db;border-radius:4px;height:80px;margin-top:4px;"></div>
    </div>

    <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#9ca3af;text-align:center;">
      ${projectName} Work Packet \u00B7 Printed ${esc(printedAt)}
    </div>
  </div>
  <script>
    window.onload = function () {
      requestAnimationFrame(function () { requestAnimationFrame(function () { window.print(); }); });
    };
    if ('onafterprint' in window) { window.onafterprint = function () { window.close(); }; }
  </script>
</body>
</html>`;
}