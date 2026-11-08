import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";

// Ordered checklist rows drafted before task creation. Saved as TaskChecklistItem records.
export default function ChecklistDraftEditor({ rows, onChange, max = 100, maxLen = 500 }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || rows.length >= max) return;
    onChange([...rows, t.slice(0, maxLen)]);
    setDraft("");
  };
  const move = (i, d) => {
    const n = [...rows];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };
  const edit = (i, v) => onChange(rows.map((r, j) => (j === i ? v.slice(0, maxLen) : r)));
  const btn = "h-8 w-8 p-0 text-gray-400 hover:text-white";

  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-xs text-gray-500 w-5 text-right shrink-0">{i + 1}.</span>
          <Input value={r} onChange={e => edit(i, e.target.value)} aria-label={`Checklist row ${i + 1}`}
            className="h-8 bg-gray-800 border-gray-700 text-white text-sm flex-1 min-w-0" />
          <Button type="button" variant="ghost" className={btn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="ghost" className={btn} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></Button>
          <Button type="button" variant="ghost" className={btn} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove row"><X className="w-3.5 h-3.5" /></Button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add checklist step…"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="h-8 bg-gray-800 border-gray-700 text-white text-sm flex-1 min-w-0" aria-label="New checklist row" />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim() || rows.length >= max} className="h-8 gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}