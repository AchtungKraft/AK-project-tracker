import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ImageSelectGrid from "./ImageSelectGrid";
import ChecklistDraftEditor from "./ChecklistDraftEditor";

// Execution draft for a single-item conversion. Edits apply to the new Task only —
// the approved estimate baseline and the source scope item are never changed.
export default function SingleTaskDraftFields({ draft, setDraft, images, limits }) {
  const toggle = (url) => setDraft(d => ({
    ...d,
    imageUrls: d.imageUrls.includes(url) ? d.imageUrls.filter(u => u !== url) : images.filter(u => u === url || d.imageUrls.includes(u)),
  }));
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-gray-400 text-xs">Task description</Label>
        <Textarea value={draft.description} maxLength={limits?.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          className="bg-gray-800 border-gray-700 text-white text-sm min-h-[180px]" />
        <p className="text-[11px] text-gray-500 mt-1">Edits change the task only. The approved estimate stays locked.</p>
      </div>
      <div>
        <Label className="text-gray-400 text-xs">Reference images ({draft.imageUrls.length} of {images.length})</Label>
        <div className="mt-1"><ImageSelectGrid images={images} selected={draft.imageUrls} onToggle={toggle} /></div>
      </div>
      <div>
        <Label className="text-gray-400 text-xs">Checklist ({draft.checklist.length})</Label>
        <div className="mt-1">
          <ChecklistDraftEditor rows={draft.checklist} onChange={rows => setDraft(d => ({ ...d, checklist: rows }))}
            max={limits?.checklist} maxLen={limits?.checklist_row} />
        </div>
      </div>
    </div>
  );
}