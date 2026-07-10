import React, { useEffect, useMemo, useRef } from "react";
import { formatPrintTimestamp } from "@/components/print/PrintTimestamp";

const DONE_STATUS_ID = "6913f57422230d8c7ee2ef54";

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

const SECTION_LABELS = {
  dueThisWeek: "DUE THIS WEEK",
  overdue: "OVERDUE",
  upcoming: "UPCOMING",
  unscheduled: "UNSCHEDULED",
};

function PrintTaskRow({ task, teamMemberMap, statusMap, blockedSet, fields }) {
  const assignee = teamMemberMap.get(task.assigned_team_member_id);
  const status = statusMap.get(task.status_id);
  const isBlocked = blockedSet.has(task.id);
  const due = parseLocalDate(task.due_date);
  const today = new Date(); today.setHours(0,0,0,0);
  const isOverdue = due && due < today;

  return (
    <div className="break-inside-avoid" style={{ pageBreakInside: "avoid" }}>
      <div className="flex items-start gap-2 py-1 border-b border-gray-200">
        {/* Checkbox */}
        <div className="w-4 h-4 border-2 border-gray-400 rounded-sm mt-0.5 shrink-0" />

        <div className="flex-1 min-w-0">
          {/* Row 1: name + priority/blocked + time */}
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm leading-snug flex items-center gap-1">
              {task.is_priority && <span className="text-xs font-bold">★</span>}
              <span className={task.is_priority ? "font-bold" : ""}>{task.name}</span>
              {isBlocked && <span className="text-[10px] font-semibold border border-gray-400 rounded px-1 ml-1">BLOCKED</span>}
            </div>
            {/* Time fields */}
            {(fields.showEstimate || fields.showActualBlank) && (
              <div className="flex items-center gap-1 shrink-0 whitespace-nowrap" style={{ width: 140, justifyContent: "flex-end" }}>
                {fields.showEstimate && (
                  <>
                    <span className="font-semibold uppercase tracking-wider text-gray-400" style={{ fontSize: 7, letterSpacing: "0.08em" }}>est</span>
                    <span className="text-gray-700 font-medium" style={{ fontSize: 10, minWidth: 28, textAlign: "right" }}>
                      {fmtHours(task.estimated_hours) || "—"}
                    </span>
                  </>
                )}
                {fields.showActualBlank && (
                  <>
                    <span className="font-semibold uppercase tracking-wider text-gray-400 ml-1" style={{ fontSize: 7, letterSpacing: "0.08em" }}>act</span>
                    <span className="inline-block border border-gray-500" style={{ width: 50, height: 14, verticalAlign: "middle" }} />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Row 2: meta */}
          <div className="flex items-center gap-3 mt-0.5">
            {fields.showAssignee && (
              <span className="text-xs text-gray-500">
                {assignee?.full_name || "Unassigned"}
              </span>
            )}
            {fields.showDueDate && (
              <span className={`text-xs ${isOverdue ? "font-bold text-gray-800" : "text-gray-500"}`}>
                Due: {fmtDate(task.due_date)}
              </span>
            )}
            {status && (
              <span className="text-xs text-gray-500">{status.label}</span>
            )}
          </div>

          {/* Notes line */}
          {fields.showNotesLine && (
            <div className="mt-0.5 flex items-center gap-1">
              <span className="text-gray-400 shrink-0" style={{ fontSize: 8 }}>Notes:</span>
              <span className="flex-1 border-b border-gray-300" style={{ height: 12 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrintProjectGroup({ project, label, tasks, teamMemberMap, statusMap, blockedSet, fields }) {
  // Project-level stats
  let estTotal = 0;
  let overdueCount = 0;
  let unassignedCount = 0;
  const today = new Date(); today.setHours(0,0,0,0);
  tasks.forEach((t) => {
    if (t.estimated_hours > 0) estTotal += t.estimated_hours;
    const d = parseLocalDate(t.due_date);
    if (d && d < today) overdueCount++;
    if (!t.assigned_team_member_id) unassignedCount++;
  });

  const meta = [];
  meta.push(`${tasks.length} Task${tasks.length !== 1 ? "s" : ""}`);
  if (overdueCount > 0) meta.push(`${overdueCount} Overdue`);
  if (unassignedCount > 0) meta.push(`${unassignedCount} Unassigned`);
  if (estTotal > 0) meta.push(`${fmtHours(estTotal)} Est.`);

  return (
    <div className="mb-4 break-inside-avoid-page">
      {/* Project header — keep with first task */}
      <div className="break-inside-avoid" style={{ pageBreakInside: "avoid" }}>
        <div className="border-b-2 border-black pb-0.5 mb-1">
          <div className="text-sm font-bold">
            {project?.name || label || "No Project"}
            {project?.client_name && (
              <span className="text-gray-500 font-normal ml-2">— {project.client_name}</span>
            )}
          </div>
          <div className="text-xs text-gray-500">{meta.join(" • ")}</div>
        </div>

        {/* Tasks */}
        <div>
          {tasks.map((task) => (
            <PrintTaskRow
              key={task.id}
              task={task}
              teamMemberMap={teamMemberMap}
              statusMap={statusMap}
              blockedSet={blockedSet}
              fields={fields}
            />
          ))}
        </div>

        {/* Project notes area */}
        <div className="mt-1 mb-2">
          <span className="text-gray-400" style={{ fontSize: 8 }}>Project Notes:</span>
          <div className="border border-gray-300 rounded" style={{ height: 24 }} />
        </div>
      </div>
    </div>
  );
}

export default function WorkloadPrintView() {
  const printDataRef = useRef(null);
  const hasPrintedRef = useRef(false);

  // Read data from sessionStorage (set by the parent before navigation)
  const data = useMemo(() => {
    const raw = sessionStorage.getItem("workload_print_data");
    if (!raw) return null;
    return JSON.parse(raw);
  }, []);

  const selectedSections = data?.selectedSections || [];
  const sectionGroups = data?.sectionGroups || {};
  const fields = data?.fields || {};
  const weekLabel = data?.weekLabel || "";

  // Rebuild maps — must be before any early return
  const teamMemberMap = useMemo(() => {
    const m = new Map();
    (data?.teamMembers || []).forEach((tm) => m.set(tm.id, tm));
    return m;
  }, [data]);

  const statusMap = useMemo(() => {
    const m = new Map();
    (data?.statuses || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [data]);

  const blockedSet = useMemo(() => new Set(data?.blockedTaskIds || []), [data]);

  const printedAt = formatPrintTimestamp();

  // Count total tasks
  let totalPrintedTasks = 0;
  selectedSections.forEach((secKey) => {
    const groups = sectionGroups[secKey] || [];
    groups.forEach((g) => { totalPrintedTasks += g.tasks.length; });
  });

  // Trigger print after render
  useEffect(() => {
    if (!data || hasPrintedRef.current) return;
    hasPrintedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, [data]);

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white text-black">
        <p className="text-gray-400">No print data available. Please use the Print Workload button from the dashboard.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; -webkit-print-color-adjust: exact; }
          @page {
            margin: 0.4in 0.5in;
            size: letter portrait;
          }
        }
        .print-only-footer { display: none; }
        @media print {
          .print-only-footer { display: block !important; }
        }
      `}</style>

      <div ref={printDataRef} className="min-h-screen bg-white text-black p-6 max-w-3xl mx-auto font-sans" style={{ fontSize: 12 }}>
        {/* Print controls — hidden on print */}
        <div className="no-print flex items-center gap-3 mb-6">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            ⎙ Print Checklist
          </button>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <span className="text-sm text-gray-400">{totalPrintedTasks} tasks</span>
        </div>

        {/* Header */}
        <div className="mb-4 border-b-2 border-black pb-2">
          <h1 className="text-lg font-bold tracking-wide">AK — WEEKLY SHOP WORKLOAD</h1>
          <div className="text-xs text-gray-600 mt-0.5">
            {weekLabel}
          </div>
          <div className="text-xs text-gray-500">
            Printed {printedAt}
          </div>
          {data.activeFilters && data.activeFilters.length > 0 && (
            <div className="text-xs text-gray-500 mt-0.5">
              {data.activeFilters.join(" • ")}
            </div>
          )}
        </div>

        {/* Sections */}
        {selectedSections.map((secKey) => {
          const groups = sectionGroups[secKey] || [];
          const taskCount = groups.reduce((s, g) => s + g.tasks.length, 0);
          if (taskCount === 0) return null;

          return (
            <div key={secKey} className="mb-6">
              <div className="text-xs font-bold uppercase tracking-wider border-b-2 border-gray-800 pb-1 mb-3">
                {SECTION_LABELS[secKey] || secKey} — {taskCount} TASK{taskCount !== 1 ? "S" : ""}
              </div>
              {groups.map((g) => (
                <PrintProjectGroup
                  key={g.projectId}
                  project={g.project}
                  label={g.label}
                  tasks={g.tasks}
                  teamMemberMap={teamMemberMap}
                  statusMap={statusMap}
                  blockedSet={blockedSet}
                  fields={fields}
                />
              ))}
            </div>
          );
        })}

        {/* Footer — visible on print */}
        <div className="mt-8 pt-3 border-t border-gray-200 text-xs text-gray-400 text-center print-only-footer" style={{ fontSize: 9 }}>
          AK Weekly Workload • {weekLabel} • Printed {printedAt}
        </div>
        {/* Screen-visible footer */}
        <div className="no-print mt-8 pt-3 border-t border-gray-200 text-xs text-gray-400 text-center">
          AK Weekly Workload • {weekLabel} • {totalPrintedTasks} tasks • Printed {printedAt}
        </div>
      </div>
    </>
  );
}