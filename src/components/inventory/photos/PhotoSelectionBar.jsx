import { Button } from "@/components/ui/button";

/** Selection state plus the contextual organizing actions (passed as children). */
export default function PhotoSelectionBar({ count, loaded, total, filterLabel, onSelectAll, onClear, onCancel, children }) {
  const allSelected = loaded > 0 && count === loaded;
  return (
    <div className="sticky top-0 z-10 space-y-2 rounded-md border border-red-900/50 bg-gray-950/95 backdrop-blur px-3 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-white">{count} selected</span>
      <span className="text-[11px] text-gray-500 flex-1 min-w-[8rem]">
        {filterLabel}{total > loaded ? ` · ${loaded} of ${total} loaded` : ''}
      </span>
      <Button size="sm" variant="outline" onClick={allSelected ? onClear : onSelectAll} disabled={!loaded}
        className="h-8 text-xs border-gray-700 text-gray-200">
        {allSelected ? 'Clear' : `Select all ${loaded}${total > loaded ? ' loaded' : ''}`}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 text-xs text-gray-400">Cancel</Button>
    </div>
    {children}
    </div>
  );
}