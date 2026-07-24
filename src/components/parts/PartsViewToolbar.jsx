import React from "react";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Filter, Archive, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PartsViewToolbar({ 
  viewMode, 
  onViewModeChange,
  showGrouping,
  onToggleGrouping,
  partsCount,
  showArchived,
  onToggleArchived,
  onPrint,
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-gray-400">
        {partsCount} {partsCount === 1 ? 'part' : 'parts'}
      </div>
      
      <div className="flex items-center gap-2">
        {/* Print Button */}
        {onPrint && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrint}
            className="h-8 text-xs gap-2 text-gray-400 hover:text-white"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </Button>
        )}

        {/* Show Archived Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleArchived}
          className={cn(
            "h-8 text-xs gap-2",
            showArchived ? "text-amber-400 bg-amber-950/30" : "text-gray-400"
          )}
        >
          <Archive className="w-4 h-4" />
          Archived
        </Button>

        {/* Grouping Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleGrouping}
          className={cn(
            "h-8 text-xs gap-2",
            showGrouping ? "text-red-400 bg-red-950/30" : "text-gray-400"
          )}
        >
          <Filter className="w-4 h-4" />
          Group
        </Button>

        {/* View Mode Toggle */}
        <div className="flex bg-gray-900/50 rounded-lg p-1 border border-gray-700">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onViewModeChange('cards')}
            className={cn(
              "h-7 px-2",
              viewMode === 'cards' ? "bg-red-600 text-white" : "text-gray-400"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onViewModeChange('list')}
            className={cn(
              "h-7 px-2",
              viewMode === 'list' ? "bg-red-600 text-white" : "text-gray-400"
            )}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}