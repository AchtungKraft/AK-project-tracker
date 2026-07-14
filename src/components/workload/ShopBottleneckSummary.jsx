import React, { useMemo } from "react";
import { AlertTriangle, Package, Truck, UserCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { BLOCKER_TYPE_LABELS } from "./workloadConfig";

function Chip({ icon: Icon, label, value, color }) {
  if (!value) return null;
  return (
    <div className={cn("flex items-center gap-1 px-2 py-1 rounded text-[11px] border", color)}>
      <Icon className="w-3 h-3 shrink-0" />
      <span>{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

export default function ShopBottleneckSummary({ sections, projectMap }) {
  const bottlenecks = useMemo(() => {
    // Collect all blocking reasons across blocked/waiting sections
    const blockerSections = ["BLOCKED", "WAITING_ON_PARTS", "WAITING_ON_VENDOR", "WAITING_ON_CUSTOMER"];
    const allBlockedTasks = [];
    const projectsBlocked = new Set();
    let waitingParts = 0;
    let waitingVendor = 0;
    let waitingCustomer = 0;
    let unassignedReady = 0;

    sections.forEach(sec => {
      if (blockerSections.includes(sec.key)) {
        sec.tasks.forEach(t => {
          allBlockedTasks.push(t);
          if (t.project_id) projectsBlocked.add(t.project_id);
        });
      }
      if (sec.key === "WAITING_ON_PARTS") waitingParts = sec.count;
      if (sec.key === "WAITING_ON_VENDOR") waitingVendor = sec.count;
      if (sec.key === "WAITING_ON_CUSTOMER") waitingCustomer = sec.count;
      if (sec.key === "READY") {
        unassignedReady = sec.tasks.filter(t => !t.assigned_team_member_id).length;
      }
    });

    // Aggregate dominant blockers by label
    const blockerCounts = {};
    allBlockedTasks.forEach(t => {
      (t.blocking_reasons || []).forEach(r => {
        const label = r.label || BLOCKER_TYPE_LABELS[r.type] || r.type;
        blockerCounts[label] = (blockerCounts[label] || 0) + 1;
      });
    });
    const dominantBlockers = Object.entries(blockerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      projectsBlocked: projectsBlocked.size,
      tasksBlocked: allBlockedTasks.length,
      waitingParts,
      waitingVendor,
      waitingCustomer,
      unassignedReady,
      dominantBlockers,
    };
  }, [sections]);

  const hasData = bottlenecks.tasksBlocked > 0 || bottlenecks.unassignedReady > 0;
  if (!hasData) return null;

  return (
    <div className="bg-red-950/10 border border-red-900/30 rounded-lg px-3 py-2">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 text-xs font-semibold text-red-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          Bottlenecks
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Chip icon={AlertTriangle} label="Projects" value={bottlenecks.projectsBlocked} color="border-red-800/40 text-red-300" />
          <Chip icon={Package} label="Parts" value={bottlenecks.waitingParts} color="border-orange-800/40 text-orange-300" />
          <Chip icon={Truck} label="Vendor" value={bottlenecks.waitingVendor} color="border-purple-800/40 text-purple-300" />
          <Chip icon={UserCheck} label="Customer" value={bottlenecks.waitingCustomer} color="border-blue-800/40 text-blue-300" />
          <Chip icon={User} label="Unassigned Ready" value={bottlenecks.unassignedReady} color="border-yellow-800/40 text-yellow-300" />
        </div>

        {/* Dominant blockers */}
        {bottlenecks.dominantBlockers.length > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {bottlenecks.dominantBlockers.map(([label, count]) => (
              <span key={label} className="text-[10px] text-red-300">
                {label} · <span className="font-bold tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}