import { Button } from "@/components/ui/button";
import { MousePointerClick } from "lucide-react";
import ViewToggle from "./ViewToggle";
import { plural } from "./contentLabels";

/** Item count vs photo count, Select, and grid/list. */
export default function ContentsToolbar({ counts, view, onView, selecting, onSelect }) {
  return (
    <div className="flex items-center gap-2">
      <p className="flex-1 min-w-0 text-[11px] leading-tight text-gray-500">
        {counts ? <>
          <span className="text-sm font-semibold text-gray-100">{plural(counts.items, 'item')}</span>
          <span className="ml-1">· {plural(counts.photos, 'photo')}</span>
          <span className="block">
            {counts.entries} documented · <span className={counts.identified_entries ? "text-blue-300" : ""}>{counts.identified_entries} identified</span>
            {counts.unsorted_photos > 0 && <> · {counts.unsorted_photos} unsorted</>}
          </span>
        </> : 'Loading…'}
      </p>
      {!selecting && (
        <Button size="sm" variant="outline" onClick={onSelect} className="h-8 px-2.5 gap-1 text-xs border-gray-700 text-gray-300">
          <MousePointerClick className="w-3.5 h-3.5" /> Select
        </Button>
      )}
      <ViewToggle view={view} onView={onView} />
    </div>
  );
}