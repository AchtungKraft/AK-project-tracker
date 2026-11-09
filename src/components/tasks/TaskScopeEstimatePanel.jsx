import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { errorText } from "@/components/scope/baselineFormat";
import BaselineEstimateBlock from "./BaselineEstimateBlock";
import TaskEstimateActuals from "./TaskEstimateActuals";
import useTaskEstimateAccess from "./useTaskEstimateAccess";
import { summaryQueryEnabled, summaryQueryKey, visibleBaselines } from "./taskEstimateAccess";

// Restricted to Bryan and Matt (enforced server-side). Everyone else gets nothing: no heading,
// no loading/error hint, and the estimate request is never sent. Read-only.
export default function TaskScopeEstimatePanel({ task }) {
  const allowed = useTaskEstimateAccess();
  const { data, error } = useQuery({
    queryKey: summaryQueryKey(task?.id),
    queryFn: async () => (await base44.functions.invoke("scopeEstimateBaseline", { action: "task_summary", taskId: task.id })).data,
    enabled: summaryQueryEnabled(allowed, task?.id),
    staleTime: 30000,
    retry: false,
  });

  if (!allowed) return null;
  if (error) return <p className="text-[11px] text-red-400 mb-3">Approved scope estimate unavailable: {errorText(error)}</p>;
  const baselines = visibleBaselines(allowed, task?.id, data);
  if (!baselines) return null;

  const scrollToParts = () => document.getElementById("task-parts-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const servicesHref = `${createPageUrl("ProjectDetail")}?id=${task.project_id}&tab=services`;

  return (
    <>
      <section className="mb-3 rounded-md border border-emerald-900/40 bg-emerald-950/10 p-3 space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/80">Approved Scope Estimate</h3>
        {baselines.map((b) => <BaselineEstimateBlock key={b.id} b={b} />)}
        <TaskEstimateActuals fin={data.financials} servicesHref={servicesHref} onLinkParts={scrollToParts} />
        <p className="text-[10px] text-gray-600">Reference allowance only — nothing is ordered or billed from this estimate.</p>
      </section>
      <hr className="border-gray-700/50 mb-4" />
    </>
  );
}