import React, { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sheet } from "lucide-react";
import EmbedInsertDialog from "./EmbedInsertDialog";
import EmbedPreviewCard from "./EmbedPreviewCard";
import { embedToken, newEmbedId, normalizeEmbeds, EMBED_DEFAULT_HEIGHT, EMBED_MAX_COUNT } from "@/lib/excelEmbeds";

// Request description editor with an Embed toolbar button. Each embed is a structured record;
// a "[[excel:<id>]]" line in the text marks where it appears. Deleting that line removes the embed.
export default function DescriptionWithEmbeds({ value, onChange, embeds, onEmbedsChange, id, placeholder, className }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const active = normalizeEmbeds(value, embeds);

  const insert = ({ url, title }) => {
    const e = { id: newEmbedId(), url, title, height: EMBED_DEFAULT_HEIGHT };
    const el = ref.current;
    const pos = el ? el.selectionEnd : value.length;
    const before = value.slice(0, pos), after = value.slice(pos);
    const token = `${before && !before.endsWith("\n") ? "\n" : ""}${embedToken(e.id)}\n`;
    onChange(before + token + after);
    onEmbedsChange([...(embeds || []), e]);
  };
  const update = (eid, patch) => onEmbedsChange((embeds || []).map(e => e.id === eid ? { ...e, ...patch } : e));
  const remove = (eid) => {
    onChange(value.split(embedToken(eid)).join("").replace(/\n{3,}/g, "\n\n"));
    onEmbedsChange((embeds || []).filter(e => e.id !== eid));
  };

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center gap-1 rounded-t-md border border-b-0 border-gray-700 bg-gray-800/70 px-1.5 py-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={active.length >= EMBED_MAX_COUNT} className="h-7 px-2 text-xs text-gray-200">
          <Sheet className="w-3.5 h-3.5 mr-1" /> Embed
        </Button>
        <span className="text-[11px] text-gray-500 truncate">Excel workbook from OneDrive or SharePoint</span>
      </div>
      <Textarea ref={ref} id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`-mt-2 rounded-t-none ${className || ""}`} />
      {active.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500">Live preview. The client sees each workbook where its [[excel:…]] line sits in the text.</p>
          {active.map((e, i) => (
            <EmbedPreviewCard key={e.id} embed={e} index={i} onHeight={(h) => update(e.id, { height: h })} onRemove={() => remove(e.id)} />
          ))}
        </div>
      )}
      <EmbedInsertDialog open={open} onClose={() => setOpen(false)} onInsert={insert} />
    </div>
  );
}