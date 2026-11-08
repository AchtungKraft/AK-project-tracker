import React from "react";
import { Input } from "@/components/ui/input";

// Explicit admin target used for the "Need funding before ordering" status. Empty = not set.
export default function FundingTargetEditor({ draft, setDraft }) {
  return (
    <div className="rounded-md bg-gray-900/50 border border-gray-800 p-3 grid sm:grid-cols-[200px_minmax(0,1fr)] gap-2 text-xs">
      <label className="space-y-1">
        <span className="text-gray-400">Funding required before ordering ($)</span>
        <Input value={draft.target} inputMode="decimal" placeholder="Not set" className="h-8 bg-gray-950 border-gray-700 text-white" onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
      </label>
      <label className="space-y-1">
        <span className="text-gray-400">Target note</span>
        <Input value={draft.targetNote} maxLength={1000} placeholder="e.g. Parts deposit agreed before ordering" className="h-8 bg-gray-950 border-gray-700 text-white" onChange={(e) => setDraft({ ...draft, targetNote: e.target.value })} />
      </label>
      <p className="sm:col-span-2 text-[11px] text-gray-500">Compared only with deposit payments actually received. Leave empty if no target was agreed.</p>
    </div>
  );
}