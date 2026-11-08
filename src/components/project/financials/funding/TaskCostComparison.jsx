import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import TaskCostRow from "./TaskCostRow";
import TaskDrawerLauncher from "./TaskDrawerLauncher";

// Per converted scope task: approved allowance vs explicitly linked part / PO cost. Linking stays manual.
export default function TaskCostComparison({ data, projectId }) {
  const [openTask, setOpenTask] = useState(null);
  const qc = useQueryClient();
  const items = data.tree.flatMap((r) => r.categories.flatMap((c) => c.groups.flatMap((g) => g.items))).filter((i) => i.state === "converted");
  const notConverted = data.totals.items_by_state?.unassigned_not_converted || 0;
  const base = `${createPageUrl("ProjectDetail")}?id=${projectId}`;
  return (
    <div className="space-y-2">
      {items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead><tr className="text-left text-gray-500"><th className="py-1 font-normal">Task</th><th className="font-normal">Allowance</th><th className="font-normal">Planned parts</th><th className="font-normal">PO committed</th><th className="font-normal">Received</th><th className="font-normal">Vs allowance</th><th /></tr></thead>
            <tbody>{items.map((i) => <TaskCostRow key={i.scope_item_id} item={i} onOpen={() => setOpenTask(i.task_id)} />)}</tbody>
          </table>
        </div>
      ) : <p className="text-xs text-gray-500">No approved scope items converted to tasks yet.</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
        {notConverted > 0 && <span>{notConverted} approved item(s) not converted to tasks</span>}
        <Link to={`${base}&tab=supply`} className="text-blue-400 hover:text-blue-300">Open Supply (parts)</Link>
        <Link to={`${base}&tab=purchaseorders`} className="text-blue-400 hover:text-blue-300">Open Purchase Orders</Link>
        <span>Parts are never assigned automatically — link them from the task.</span>
      </div>
      {openTask && <TaskDrawerLauncher taskId={openTask} projectId={projectId} onClose={() => { setOpenTask(null); qc.invalidateQueries({ queryKey: ["scopeFundingRecon", projectId] }); }} />}
    </div>
  );
}