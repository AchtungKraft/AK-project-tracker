import React from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import ExcelEmbedFrame from "./ExcelEmbedFrame";
import { EMBED_MIN_HEIGHT, EMBED_MAX_HEIGHT } from "@/lib/excelEmbeds";

// Live editor preview of one embed with height control and remove.
export default function EmbedPreviewCard({ embed, index, onHeight, onRemove }) {
  return (
    <div className="rounded-md border border-gray-700 bg-gray-800/40 p-2 min-w-0">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400 shrink-0">Embed {index + 1}</span>
        <span className="text-xs text-gray-500 shrink-0">Height</span>
        <Slider value={[embed.height]} min={EMBED_MIN_HEIGHT} max={EMBED_MAX_HEIGHT} step={20} onValueChange={([h]) => onHeight(h)} className="flex-1 min-w-0" />
        <span className="text-xs text-gray-400 w-12 text-right shrink-0">{embed.height}px</span>
        <Button type="button" size="icon" variant="ghost" onClick={onRemove} className="h-7 w-7 shrink-0 text-gray-400 hover:text-red-400" aria-label="Remove embed">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <ExcelEmbedFrame embed={embed} />
    </div>
  );
}