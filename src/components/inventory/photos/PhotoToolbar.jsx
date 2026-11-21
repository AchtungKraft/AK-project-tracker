import { Button } from "@/components/ui/button";
import { LayoutGrid, List, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: 'all', label: 'All', count: (c) => c.photos },
  { key: 'unsorted', label: 'Unsorted', count: (c) => c.unsorted_photos },
  { key: 'identified', label: 'Identified', count: (c) => c.identified_photos },
];

/** Filters (photo counts), item counts, select, and grid/list toggle (Parts Tracker style). */
export default function PhotoToolbar({ counts, filter, onFilter, view, onView, selecting, onSelect }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" role="tablist" aria-label="Photo filter">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => onFilter(f.key)}
            className={cn("flex-1 sm:flex-none h-9 px-3 rounded-md border text-xs font-medium whitespace-nowrap",
              filter === f.key ? "bg-red-600 border-red-600 text-white" : "bg-gray-900/50 border-gray-700 text-gray-300")}>
            {f.label}{counts ? <span className="ml-1 opacity-80">{f.count(counts)}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 text-[11px] text-gray-500 leading-tight">
          {counts ? <>
            <span className="text-gray-300">{counts.photos}</span> photos · <span className="text-gray-300">{counts.entries}</span> documented {counts.entries === 1 ? 'item' : 'items'} · <span className="text-gray-300">{counts.identified_entries}</span> identified
          </> : 'Loading counts…'}
        </p>
        {!selecting && (
          <Button size="sm" variant="outline" onClick={onSelect} className="h-8 px-2.5 gap-1 text-xs border-gray-700 text-gray-300">
            <MousePointerClick className="w-3.5 h-3.5" /> Select
          </Button>
        )}
        <div className="flex bg-gray-900/50 rounded-lg p-1 border border-gray-700 shrink-0">
          <Button size="sm" variant="ghost" aria-label="Grid view" onClick={() => onView('grid')}
            className={cn("h-7 px-2", view === 'grid' ? "bg-red-600 text-white" : "text-gray-400")}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" aria-label="List view" onClick={() => onView('list')}
            className={cn("h-7 px-2", view === 'list' ? "bg-red-600 text-white" : "text-gray-400")}>
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}