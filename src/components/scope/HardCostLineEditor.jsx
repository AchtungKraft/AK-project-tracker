import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { formatHardLine } from "./scopeEstimate";
import EstimateStateHint from "./EstimateStateHint";

/** One hard cost line: Low only = exact, High only = up to, both = range, neither = description only. */
export default function HardCostLineEditor({ line, onChange, onRemove }) {
  return (
    <div className="p-2 border border-gray-700/50 rounded-md space-y-2">
      <div className="flex gap-2 items-center">
        <Input value={line.description || ''} onChange={e => onChange('description', e.target.value)} placeholder="Part, material, service or deliverable" className="h-8 flex-1 bg-gray-800 border-gray-700 text-white text-xs" />
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox checked={!!line.tbd} onCheckedChange={v => onChange('tbd', !!v)} /> <span className="text-xs text-gray-400">TBD</span>
        {!line.tbd && (
          <>
            <Input type="number" min="0" value={line.min ?? ''} onChange={e => onChange('min', e.target.value)} placeholder="Low $" className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs" />
            <span>–</span>
            <Input type="number" min="0" value={line.max ?? ''} onChange={e => onChange('max', e.target.value)} placeholder="High $" className="h-8 w-28 bg-gray-800 border-gray-700 text-white text-xs" />
          </>
        )}
        <EstimateStateHint label={formatHardLine(line)} />
      </div>
    </div>
  );
}