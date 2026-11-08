import React from "react";
import { Link } from "react-router-dom";
import { ListChecks, AlertTriangle, Clock, CircleDashed, ListPlus, ExternalLink } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useScopeConversion } from "./ScopeConversionContext";

const STYLES = {
  created: { label: "Task Created", cls: "text-emerald-300 border-emerald-700/40 bg-emerald-950/30", Icon: ListChecks },
  approved_not_converted: { label: "Approved · Not Converted", cls: "text-amber-300 border-amber-700/40 bg-amber-950/30", Icon: CircleDashed },
  pending_approval: { label: "Pending Approval", cls: "text-gray-400 border-gray-700/50 bg-gray-900/40", Icon: Clock },
  needs_review: { label: "Link Needs Review", cls: "text-red-300 border-red-700/40 bg-red-950/30", Icon: AlertTriangle },
};

/** INTERNAL ONLY — renders nothing outside the staff conversion provider. */
export default function ScopeTaskConversionBadge({ itemId, onCreateTask }) {
  const ctx = useScopeConversion();
  const status = ctx?.ready ? ctx.byItem[itemId] : null;
  if (!status?.state) return null;

  const { label, cls, Icon } = STYLES[status.state];
  const taskUrl = createPageUrl(`ProjectDetail?id=${ctx.projectId}&tab=tasks`);
  const single = status.tasks.length === 1;

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[11px] min-w-0">
      <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded border shrink-0 ${cls}`} title={status.reasons.join(" · ") || undefined}>
        <Icon className="w-3 h-3" />
        {label}
        {status.state === "created" && status.tasks.length > 1 && <span className="opacity-70">· {status.tasks.length}</span>}
      </span>
      {status.tasks.map(t => (
        <Link key={t.id} to={taskUrl} onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline truncate max-w-[14rem]"
          title={`Open in project tasks: ${t.name}`} aria-label={`View task ${t.name}`}>
          <ExternalLink className="w-3 h-3 shrink-0" />{single ? "View Task" : t.name}
        </Link>
      ))}
      {status.state === "approved_not_converted" && onCreateTask && (
        <button type="button" onClick={e => { e.stopPropagation(); onCreateTask(itemId); }}
          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-emerald-700/50 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label="Create task from this approved scope item">
          <ListPlus className="w-3 h-3" /> Create Task
        </button>
      )}
      {status.state === "needs_review" && (
        <span className="text-red-400/80 truncate">{status.reasons.join(" · ")}</span>
      )}
    </div>
  );
}