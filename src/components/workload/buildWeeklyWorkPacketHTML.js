/**
 * buildWeeklyWorkPacketHTML(data) → string
 *
 * "By Due Date — Weekly / Phase Grouped" Work Packet. Same task blocks and
 * document shell as the Standard packet; grouping comes from the shared
 * weeklyDueGrouping utility (also used by the WEEKLY DUE workload view).
 * Read-only: never mutates tasks.
 */
import {
  esc, fmtHours, formatTimestamp,
  createTaskRenderer, groupByPhase, renderPacketDocument,
} from "./workPacketShared.js";
import {
  groupTasksByWeek, summarizeWeek, sortByDue, isTaskOverdue, weekTitle,
} from "../../lib/weeklyDueGrouping.js";

export { parseDateOnly, toKey, mondayOf, groupTasksByWeek, summarizeWeek } from "../../lib/weeklyDueGrouping.js";

export default function buildWeeklyWorkPacketHTML(data) {
  const { project, tasks, buckets = [], weekLabel = "", today = new Date() } = data;
  const printedAt = formatTimestamp();
  const renderTask = createTaskRenderer(data);
  const isOverdue = (t) => isTaskOverdue(t, today);

  function phaseHeading(name, color) {
    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1.5px solid #374151;margin-bottom:3px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color || '#6B7280'};"></span>
          <span style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">${esc(name)}</span>
        </div>`;
  }

  // Heading(s) are glued to the first task so they never sit alone at a page bottom.
  function renderPhase(name, color, list, lead = "") {
    const [first, ...rest] = sortByDue(list);
    return `<div style="margin-bottom:8px;">
      <div style="page-break-inside:avoid;break-inside:avoid;">
        ${lead}${phaseHeading(name, color)}
        ${renderTask(first, { overdue: isOverdue(first) })}
      </div>
      ${rest.map(t => renderTask(t, { overdue: isOverdue(t) })).join("")}
    </div>`;
  }

  function weekHeading(title, list) {
    const s = summarizeWeek(list, today);
    const parts = [`${s.total} task${s.total !== 1 ? "s" : ""}`, `${fmtHours(s.estHours) || "0h"} est. labor`];
    if (s.missing > 0) parts.push(`${s.missing} missing estimate${s.missing !== 1 ? "s" : ""}`);
    if (s.overdue > 0) parts.push(`<b>${s.overdue} overdue</b>`);
    return `<div style="margin-top:6px;margin-bottom:6px;padding:4px 6px;border:2px solid #000;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;">${title}</span>
          <span style="font-size:10px;color:#374151;margin-left:auto;">${parts.join(" \u00B7 ")}</span>
        </div>`;
  }

  function renderSection(title, list) {
    const { groups, unphased } = groupByPhase(list, buckets);
    const phases = groups.map(g => [g.bucket.name, g.bucket.color, g.tasks]);
    if (unphased.length > 0) phases.push(["GENERAL / NO PHASE", "#6B7280", unphased]);
    return `<section style="margin-bottom:14px;">
      ${phases.map(([n, c, l], i) => renderPhase(n, c, l, i === 0 ? weekHeading(title, list) : "")).join("")}
    </section>`;
  }

  const { weeks, unscheduled } = groupTasksByWeek(tasks);
  let bodyHtml = weeks.map(w => renderSection(esc(weekTitle(w)), w.tasks)).join("");
  if (unscheduled.length > 0) bodyHtml += renderSection("Unscheduled / No Due Date", unscheduled);

  const label = ["By Due Date \u2014 Weekly / Phase Grouped", weekLabel].filter(Boolean).join(" \u00B7 ");
  return renderPacketDocument({ project, tasks, weekLabel: label, printedAt, bodyHtml });
}