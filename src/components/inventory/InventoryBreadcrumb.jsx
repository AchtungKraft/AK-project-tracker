import React from "react";
import { Home, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function InventoryBreadcrumb({ path, onPathClick, onClearSelection }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="h-8 px-2 hover:bg-red-950/30"
      >
        <Home className="w-4 h-4 text-gray-400" />
      </Button>

      {path.length > 0 && (
        <>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <span className="text-gray-500">INVENTORY</span>
        </>
      )}

      {path.map((item, idx) => (
        <React.Fragment key={item.id}>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <button
            onClick={() => onPathClick(item.id)}
            className={cn(
              "hover:text-red-400 transition-colors",
              idx === path.length - 1 ? "font-medium" : "text-gray-400"
            )}
            style={{
              color: idx === path.length - 1 ? item.color : undefined,
            }}
          >
            {item.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}