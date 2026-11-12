/**
 * buildWeeklyWorkPacketHTML(data) → string
 *
 * "By Due Date — Weekly / Phase Grouped" Work Packet. Same task blocks and
 * document shell as the Standard packet; tasks are grouped by Monday–Sunday
 * week of their persisted due_date (date-only, local — no UTC shift), then by
 * phase, earliest due first. Tasks without a due date go in a final section.
 * Read-only: never mutates tasks.
 */
import {
  esc, fmtHours, formatTimestamp, DONE_STATUS_ID,
  createTaskRenderer, groupByPhase, renderPacketDocument,
} from "./workPacketShared.js";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseDateOnly(s) {
  const m = typeof s === "string" && s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday of the week containing d (local calendar). */
export function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const hasEstimate = (t) => typeof t.estimated_hours === "number" && t.estimated_hours > 0;
const md = (d) => `${DAY[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;

/** Pure grouping: [{ key, start, end, tasks }] ascending, plus unscheduled tasks. */
export function groupTasksByWeek(tasks) {
  const weeks = new Map();
  const unscheduled = [];
  tasks.forEach(t => {
    const d = parseDateOnly(t.due_date);
    if (!d) { unscheduled.push(t); return; }
    const start = mondayOf(d);
    const key = toKey(start);
    if (!weeks.has(key)) {
      const end = new Date(start); end.setDate(end.getDate() + 6);
      weeks.set(key, { key, start, end, tasks: [] });
    }
    weeks.get(key).tasks.push(t);
  });
  const sorted = [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key));
  return { weeks: sorted, unscheduled };
}

export function summarizeWeek(tasks) {
  const estimated = tasks.filter(hasEstimate);
  return {
    total: tasks.length,
    estHours: estimated.reduce((s, t) => s + t.estimated_hours, 0),
    missing: tasks.length - estimated.length,
  };
}

export default function buildWeeklyWorkPacketHTML(data) {
  const { project, tasks, buckets = [], weekLabel = "", today = new Date() } = data;
  const printedAt = formatTimestamp();
  const renderTask = createTaskRenderer(data);
  const todayKey = toKey(today);
  const isOverdue = (t) => t.status_id !== DONE_STATUS_ID && !!t.due_date && t.due_date.slice(0, 10) < todayKey;

  // Stable: earliest due first; equal dates keep the workload order.
  const byDue = (list) => list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.due_date || "").slice(0, 10).localeCompare((b.t.due_date || "").slice(0, 10)) || a.i - b.i)
    .map(x => x.t);

  function phaseHeading(name, color) {
    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1.5px solid #374151;margin-bottom:3px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color || '#6B7280'};"></span>
          <span style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;">${esc(name)}</span>
        </div>`;
  }

  // Heading(s) are glued to the first task so they never sit alone at a page bottom.
  function renderPhase(name, color, list, lead = "") {
    const sorted = byDue(list);
    const [first, ...rest] = sorted;
    return `<div style="margin-bottom:8px;">
      <div style="page-break-inside:avoid;break-inside:avoid;">
        ${lead}${phaseHeading(name, color)}
        ${renderTask(first, { overdue: isOverdue(first) })}
      </div>
      ${rest.map(t => renderTask(t, { overdue: isOverdue(t) })).join("")}
    </div>`;
  }

  function weekHeading(title, list) {
    const s = summarizeWeek(list);
    const overdueCount = list.filter(isOverdue).length;
    const parts = [`${s.total} task${s.total !== 1 ? "s" : ""}`, `${fmtHours(s.estHours) || "0h"} est. labor`];
    if (s.missing > 0) parts.push(`${s.missing} missing estimate${s.missing !== 1 ? "s" : ""}`);
    if (overdueCount > 0) parts.push(`<b>${overdueCount} overdue</b>`);
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
  let bodyHtml = weeks.map(w => {
    const year = w.end.getFullYear();
    const title = `Week of ${md(w.start)} \u2013 ${md(w.end)}, ${year}`;
    return renderSection(esc(title), w.tasks);
  }).join("");
  if (unscheduled.length > 0) bodyHtml += renderSection("Unscheduled / No Due Date", unscheduled);

  const label = ["By Due Date \u2014 Weekly / Phase Grouped", weekLabel].filter(Boolean).join(" \u00B7 ");
  return renderPacketDocument({ project, tasks, weekLabel: label, printedAt, bodyHtml });
}