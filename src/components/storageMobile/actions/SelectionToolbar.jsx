import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import ActionButtons from "./ActionButtons";

const PLACEMENT = {
  // Sits just above the mobile bottom navigation; on desktop near the bottom of the panel.
  page: "bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-3",
  // Full-screen sheets cover the bottom navigation.
  sheet: "bottom-[calc(0.5rem+env(safe-area-inset-bottom))]",
};

/**
 * Compact selection toolbar shared by Contents, Photos and item detail.
 * Place it after the collection: it sticks to the bottom while the collection is on screen.
 */
export default function SelectionToolbar({ count, loaded, total, scopeLabel, onSelectAll, onClear, onCancel, actions, onAction, hint, placement = 'page' }) {
  const allSelected = loaded > 0 && count === loaded;
  const more = total > loaded;
  return (
    <div className={cn("sticky z-30 rounded-lg border border-red-900/60 bg-gray-950/95 p-2 shadow-lg shadow-black/50 backdrop-blur space-y-1.5", PLACEMENT[placement])}
      role="toolbar" aria-label="Selection">
      <div className="flex items-center gap-1.5 min-w-0">
        <button type="button" onClick={onCancel} aria-label="Cancel selection"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-300 active:bg-gray-800">
          <X className="w-4 h-4" />
        </button>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-white">
          {count} selected
          {scopeLabel && <span className="ml-1 text-[11px] font-normal text-gray-500">· {scopeLabel}</span>}
        </span>
        {onSelectAll && (
          <button type="button" onClick={allSelected ? onClear : onSelectAll} disabled={!loaded}
            className="h-8 shrink-0 rounded-md border border-gray-700 px-2 text-[11px] font-medium text-gray-200 active:bg-gray-800">
            {allSelected ? 'Clear' : more ? `All ${loaded} loaded` : `All ${loaded}`}
          </button>
        )}
      </div>
      {count ? <ActionButtons actions={actions} onAction={onAction} />
        : <p className="px-1 text-[11px] text-gray-500">{hint || 'Tap to select.'}</p>}
    </div>
  );
}