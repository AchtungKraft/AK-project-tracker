import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import DescriptionCleanupRow from "./DescriptionCleanupRow";
import { errorText } from "./baselineFormat";

// Admin-only: dry-run preview of removing the legacy auto-generated scope block from converted task
// descriptions. Applies to one task at a time after review; the original text is kept in an audit log.
export default function TaskDescriptionCleanupPanel({ requestId, projectId }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const key = ["taskDescriptionCleanup", requestId];
  const { data, isLoading, error } = useQuery({
    queryKey: key, enabled: open,
    queryFn: async () => (await base44.functions.invoke("taskDescriptionCleanup", { action: "preview", requestId })).data,
  });
  const rows = data?.rows || [];

  const apply = async (row) => {
    setBusyId(row.task_id); setMsg(null);
    try {
      await base44.functions.invoke("taskDescriptionCleanup", { action: "apply", requestId, taskId: row.task_id, expectedHash: row.before_hash, confirm: true, acknowledgeEdited: row.status === "narrative_edited" });
      setMsg({ ok: true, text: `Cleaned "${row.task_name}". Original description saved in the audit log.` });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
    finally {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projectTasks", projectId] });
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-300">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Task description cleanup (admin · dry run)
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-gray-500">Preview only. Nothing changes until you apply a single task. Estimates stay in the Approved Scope Estimate panel.</p>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {error && <p className="text-xs text-red-400">{errorText(error)}</p>}
          {msg && <p className={`text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
          {data && !rows.length && <p className="text-xs text-gray-500">No converted tasks for this scope review.</p>}
          {rows.map(r => <DescriptionCleanupRow key={r.task_id} row={r} busy={busyId === r.task_id} onApply={apply} />)}
        </div>
      )}
    </div>
  );
}