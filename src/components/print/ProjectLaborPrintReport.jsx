import React from "react";
import { formatDuration } from "@/lib/estimateUtils";

/**
 * ProjectLaborPrintReport — printable project labor summary.
 *
 * @param {Object} project
 * @param {Object} laborSummary - from buildProjectLaborSummary()
 * @param {Array} timeEntries - raw entries for detail rows
 * @param {Array} tasks
 * @param {Array} teamMembers
 */
export default function ProjectLaborPrintReport({ project, laborSummary, timeEntries = [], tasks = [], teamMembers = [] }) {
  if (!laborSummary) return null;

  const taskEntries = Object.values(laborSummary.byTask)
    .filter(t => t.loggedHours > 0 || t.estimatedHours)
    .sort((a, b) => (b.loggedHours || 0) - (a.loggedHours || 0));

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
      </div>

      {/* Summary */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <tbody>
          <SummaryRow label="Estimated Hours" value={fmt(laborSummary.totalEstimated)} />
          <SummaryRow label="Logged Hours" value={fmt(laborSummary.totalLogged)} bold />
          <SummaryRow
            label="Variance"
            value={laborSummary.totalVariance === 0
              ? "On target"
              : `${fmt(Math.abs(laborSummary.totalVariance))} ${laborSummary.totalVariance > 0 ? "over" : "under"}`
            }
            color={laborSummary.totalVariance > 0 ? "#dc2626" : laborSummary.totalVariance < 0 ? "#16a34a" : "#666"}
          />
          <SummaryRow label="Completed Task Hours" value={fmt(laborSummary.completedTaskLogged)} />
          <SummaryRow label="Open Task Hours" value={fmt(laborSummary.openTaskLogged)} />
          <SummaryRow label="Tasks Missing Estimates" value={String(laborSummary.missingEstimates)} />
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
                <th style={{ textAlign: "left", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Name</th>
                <th style={{ textAlign: "right", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Hours</th>
                <th style={{ textAlign: "right", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Entries</th>
              </tr>
            </thead>
            <tbody>
              {memberEntries.map(m => (
                <tr key={m.memberId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "3px 4px" }}>{m.memberName}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 500 }}>{fmt(m.hours)}</td>
                  <td style={{ padding: "3px 4px", textAlign: "right", color: "#999" }}>{m.entryCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Task Detail Table */}
      {taskEntries.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 6px", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>
            Hours by Task
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd" }}>
                <th style={{ textAlign: "left", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Task</th>
                <th style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Status</th>
                <th style={{ textAlign: "right", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Est</th>
                <th style={{ textAlign: "right", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Logged</th>
                <th style={{ textAlign: "right", fontSize: 9, fontWeight: 600, color: "#999", padding: "2px 4px", textTransform: "uppercase" }}>Var</th>
              </tr>
            </thead>
            <tbody>
              {taskEntries.map(t => (
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

function fmt(hours) {
  return formatDuration(hours) || "0h";
}