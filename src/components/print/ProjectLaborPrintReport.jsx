import React from "react";
import { formatDuration } from "@/lib/estimateUtils";
import { ESTIMATE_STATUS_LABELS } from "@/lib/taskTimeUtils";

const TASK_FILTER_LABELS = {
  with_hours: 'Tasks With Logged Hours',
  all: 'All Tasks',
  missing_estimates: 'Tasks Missing Estimates',
  over_estimate: 'Tasks Over Estimate',
  completed: 'Completed Tasks',
  open: 'Open Tasks',
};

/**
 * ProjectLaborPrintReport — printable project labor summary.
 * Uses revised canonical labor summary with estimated/unestimated split.
 */
export default function ProjectLaborPrintReport({ project, laborSummary, timeEntries = [], tasks = [], teamMembers = [], taskFilter = 'with_hours' }) {
  if (!laborSummary) return null;

  const allTaskEntries = Object.values(laborSummary.byTask);
  const filteredTaskEntries = allTaskEntries.filter(t => {
    switch (taskFilter) {
      case 'with_hours': return t.loggedHours > 0;
      case 'missing_estimates': return t.estimateStatus === 'missing_estimate';
      case 'over_estimate': return t.estimateStatus === 'over_estimate';
      case 'completed': return t.status === 'completed';
      case 'open': return t.status === 'open';
      default: return true;
    }
  }).sort((a, b) => (b.loggedHours || 0) - (a.loggedHours || 0));

  const memberEntries = Object.values(laborSummary.byTeamMember).sort((a, b) => b.hours - a.hours);

  return (
    <div className="print-labor-report" style={{ fontFamily: "system-ui, sans-serif", fontSize: 11, color: "#333" }}>
      {/* Header */}
      <div style={{ borderBottom: "2px solid #333", paddingBottom: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          Project Labor Report
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
          {project?.name || "Unknown Project"}
        </p>
        <p style={{ fontSize: 10, color: "#999", margin: "2px 0 0" }}>
          Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
        <p style={{ fontSize: 9, color: "#aaa", margin: "2px 0 0" }}>
          Task Scope: {TASK_FILTER_LABELS[taskFilter] || taskFilter}
        </p>
      </div>

      {/* Summary */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <SummaryRow label="Estimated Hours" value={fmt(laborSummary.totalEstimatedHours)} />
          <SummaryRow label="Total Logged Hours" value={fmt(laborSummary.totalLoggedHours)} bold />
          <SummaryRow label="Logged on Estimated Tasks" value={fmt(laborSummary.estimatedTaskLoggedHours)} />
          <SummaryRow
            label="Unestimated Logged Hours"
            value={fmt(laborSummary.unestimatedTaskLoggedHours)}
            color={laborSummary.unestimatedTaskLoggedHours > 0 ? "#d97706" : "#666"}
          />
          <SummaryRow
            label="Variance on Estimated Work"
            value={laborSummary.varianceOnEstimatedTasks === 0
              ? "On target"
              : `${fmt(Math.abs(laborSummary.varianceOnEstimatedTasks))} ${laborSummary.varianceOnEstimatedTasks > 0 ? "over" : "under"}`
            }
            color={laborSummary.varianceOnEstimatedTasks > 0 ? "#dc2626" : laborSummary.varianceOnEstimatedTasks < 0 ? "#16a34a" : "#666"}
          />
          <SummaryRow label="Completed Task Hours" value={fmt(laborSummary.completedTaskLoggedHours)} />
          <SummaryRow label="Open Task Hours" value={fmt(laborSummary.openTaskLoggedHours)} />
          <SummaryRow label="Tasks Missing Estimates" value={String(laborSummary.unestimatedTaskCount)} />
          <SummaryRow label="Completed w/o Hours" value={String(laborSummary.completedZeroHours)} />
        </tbody>
      </table>

      {/* Team Member Breakdown */}
      {memberEntries.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 6px", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>
            Hours by Team Member
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <TH align="left">Name</TH>
                <TH align="right">Total</TH>
                <TH align="right">Estimated Tasks</TH>
                <TH align="right">Unestimated</TH>
                <TH align="right">Entries</TH>
              </tr>
            </thead>
            <tbody>
              {memberEntries.map(m => (
                <tr key={m.memberId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "3px 4px" }}>{m.memberName}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 500 }}>{fmt(m.hours)}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", color: "#666" }}>{fmt(m.estimatedTaskHours)}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", color: m.unestimatedTaskHours > 0 ? "#d97706" : "#999" }}>
                    {m.unestimatedTaskHours > 0 ? fmt(m.unestimatedTaskHours) : "—"}
                  </td>
                  <td style={{ padding: "3px 4px", textAlign: "right", color: "#999" }}>{m.entryCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Task Detail Table */}
      {filteredTaskEntries.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 6px", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>
            Hours by Task
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <TH align="left">Task</TH>
                <TH align="center">Status</TH>
                <TH align="right">Est</TH>
                <TH align="right">Logged</TH>
                <TH align="right">Variance</TH>
                <TH align="right">Est. Status</TH>
              </tr>
            </thead>
            <tbody>
              {filteredTaskEntries.map(t => (
                <tr key={t.taskId} style={{ borderBottom: "1px solid #eee", breakInside: "avoid" }}>
                  <td style={{ padding: "3px 4px", maxWidth: 200 }}>{t.taskName}</td>
                  <td style={{ padding: "3px 4px", textAlign: "center", color: t.status === "completed" ? "#16a34a" : "#999" }}>
                    {t.status === "completed" ? "✓" : "○"}
                  </td>
                  <td style={{ padding: "3px 4px", textAlign: "right", color: "#666" }}>
                    {t.estimatedHours ? fmt(t.estimatedHours) : "—"}
                  </td>
                  <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 500 }}>
                    {fmt(t.loggedHours) || "0h"}
                  </td>
                  <td style={{
                    padding: "3px 4px",
                    textAlign: "right",
                    color: t.varianceHours == null ? "#ccc" : t.varianceHours > 0 ? "#dc2626" : t.varianceHours < 0 ? "#16a34a" : "#666",
                  }}>
                    {t.varianceHours == null ? "—" : t.varianceHours === 0 ? "0" : `${t.varianceHours > 0 ? '+' : ''}${fmt(Math.abs(t.varianceHours))}`}
                  </td>
                  <td style={{
                    padding: "3px 4px",
                    textAlign: "right",
                    fontSize: 9,
                    color: t.estimateStatus === 'missing_estimate' ? '#d97706' : t.estimateStatus === 'over_estimate' ? '#dc2626' : '#999',
                  }}>
                    {ESTIMATE_STATUS_LABELS[t.estimateStatus] || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value, bold = false, color }) {
  return (
    <tr>
      <td style={{ padding: "3px 4px", color: "#666", width: "60%" }}>{label}</td>
      <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: bold ? 700 : 400, color: color || "#333" }}>
        {value}
      </td>
    </tr>
  );
}

function TH({ children, align = "left" }) {
  return (
    <th style={{ textAlign: align, fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>
      {children}
    </th>
  );
}

function fmt(hours) {
  return formatDuration(hours) || "0h";
}