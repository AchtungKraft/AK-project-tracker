/**
 * buildProjectWorkPacketHTML(data) → string
 *
 * Standard Work Packet: a clean, black-and-white project work packet for shop technicians.
 * Groups tasks by phase, shows blocking reasons, dependency unlocks,
 * optional checklists, and technician annotation fields.
 */
import {
  esc, fmtHours, formatTimestamp, DONE_STATUS_ID,
  createTaskRenderer, groupByPhase, renderPacketDocument,
} from "./workPacketShared.js";

export default function buildProjectWorkPacketHTML(data) {
  const { project, tasks, buckets = [], weekLabel = "" } = data;
  const printedAt = formatTimestamp();
  const renderTask = createTaskRenderer(data);
  const { groups, unphased } = groupByPhase(tasks, buckets);

  function renderPhaseGroup(name, color, phaseTasks) {
    if (phaseTasks.length === 0) return "";
    const openCount = phaseTasks.filter(t => t.status_id !== DONE_STATUS_ID).length;
    const doneCount = phaseTasks.length - openCount;
    // Sum estimated hours for open tasks
    let estTotal = 0;
    phaseTasks.forEach(t => { if (t.status_id !== DONE_STATUS_ID && t.estimated_hours > 0) estTotal += t.estimated_hours; });
    const estDisplay = fmtHours(estTotal);
    let statsParts = [];
    statsParts.push(doneCount > 0 ? `${openCount} OPEN \u00B7 ${doneCount} DONE` : `${openCount} OPEN`);
    if (estDisplay) statsParts.push(`${estDisplay} Est.`);
    const stats = statsParts.join(" \u00B7 ");
    return `<div style="margin-bottom:12px;">
      <div style="page-break-inside:avoid;page-break-after:avoid;">
        <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1.5px solid #374151;margin-bottom:4px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color || '#6B7280'};"></span>
          <span style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">${esc(name)}</span>
          <span style="font-size:10px;color:#6b7280;margin-left:auto;">${stats}</span>
        </div>
      </div>
      ${phaseTasks.map(t => renderTask(t)).join("")}
    </div>`;
  }

  let phasesHtml = "";
  groups.forEach(({ bucket, tasks: pt }) => {
    phasesHtml += renderPhaseGroup(bucket.name, bucket.color, pt);
  });
  if (unphased.length > 0) {
    phasesHtml += renderPhaseGroup("GENERAL / NO PHASE", "#6B7280", unphased);
  }

  return renderPacketDocument({ project, tasks, weekLabel, printedAt, bodyHtml: phasesHtml });
}