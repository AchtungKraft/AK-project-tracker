import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

const STATUS = {
  ready: ["Generated block found · narrative matches source", "text-emerald-400"],
  narrative_edited: ["Generated block found · narrative edited after conversion", "text-amber-300"],
  images_not_attached: ["Block lists images not attached to the task · run image backfill first", "text-amber-300"],
  unrecognized: ["Block edited or followed by other text · left unchanged", "text-gray-400"],
  no_block: ["No generated block", "text-gray-500"],
};
const Pre = ({ label, text }) => (
  <div className="min-w-0"><p className="text-[11px] text-gray-500 mb-0.5">{label}</p>
    <pre className="whitespace-pre-wrap break-words text-xs text-gray-200 bg-gray-950/60 border border-gray-800 rounded p-2 max-h-60 overflow-y-auto">{text || "(empty)"}</pre></div>
);

export default function DescriptionCleanupRow({ row, onApply, busy }) {
  const [ok, setOk] = useState(false);
  const [label, tone] = STATUS[row.status] || [row.status, "text-gray-400"];
  const applicable = row.status === "ready" || row.status === "narrative_edited";
  return (
    <div className="rounded border border-gray-800 p-2 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-white font-medium">{row.task_name}</span>
        <span className={`text-xs ${tone}`}>{label}</span>
      </div>
      <p className="text-[11px] text-gray-500">Source scope item: {row.scope_item_title || "—"} ({row.scope_item_id || "none"})</p>
      {row.after != null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Pre label="Before (current)" text={row.before} />
          <Pre label="After (proposed)" text={row.after} />
        </div>
      )}
      {applicable && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <Checkbox checked={ok} onCheckedChange={v => setOk(!!v)} />
            {row.status === "narrative_edited" ? "Keep my edited narrative and remove only the generated block" : "I reviewed this change"}
          </label>
          <Button size="sm" disabled={!ok || busy} onClick={() => onApply(row)} className="bg-red-600 hover:bg-red-700 h-7">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply to this task"}
          </Button>
        </div>
      )}
    </div>
  );
}