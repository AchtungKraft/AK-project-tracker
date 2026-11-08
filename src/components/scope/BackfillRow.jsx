import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BaselineStatusBadge from "./BaselineStatusBadge";
import { reasonText } from "./baselineFormat";

// One backfill_preview row. Ambiguous rows require explicit confirmation + reason before apply.
export default function BackfillRow({ row, pick = {}, onChange }) {
  const actionable = row.status === "ready" || row.status === "needs_confirmation";
  const ambiguous = row.status === "needs_confirmation";
  const candidates = row.candidate_tasks || [];
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-start gap-2">
        {actionable ? (
          <Checkbox checked={!!pick.selected} onCheckedChange={(v) => onChange({ selected: !!v })} className="mt-0.5" />
        ) : <span className="w-4" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <BaselineStatusBadge status={row.status} />
            <span className="text-sm text-white truncate">{row.title}</span>
          </div>
          {row.reasons?.length > 0 && <div className="text-xs text-gray-400 mt-0.5">{row.reasons.map(reasonText).join(" · ")}</div>}
          {candidates.length === 1 && <div className="text-xs text-gray-500 mt-0.5">Task: {candidates[0].name}</div>}
        </div>
      </div>
      {actionable && pick.selected && ambiguous && (
        <div className="ml-6 space-y-2">
          {candidates.length > 1 && (
            <Select value={pick.task_id || ""} onValueChange={(v) => onChange({ task_id: v })}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-xs"><SelectValue placeholder="Choose the task this estimate belongs to" /></SelectTrigger>
              <SelectContent>{candidates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Textarea
            value={pick.note || ""}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Reason for accepting this baseline (min 5 characters)"
            className="bg-gray-800 border-gray-700 text-white text-xs min-h-[56px]"
          />
          <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer">
            <Checkbox checked={!!pick.confirm} onCheckedChange={(v) => onChange({ confirm: !!v })} />
            I confirm the captured values are the approved estimate for this task
          </label>
        </div>
      )}
    </div>
  );
}