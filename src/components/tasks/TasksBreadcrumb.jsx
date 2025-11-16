import React from "react";
import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TasksBreadcrumb({ path, onNavigate, onClearSelection }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="h-7 px-2 text-gray-400 hover:text-red-400 hover:bg-red-950/30"
      >
        <Home className="w-4 h-4" />
      </Button>

      {path.map((item, index) => (
        <React.Fragment key={item.id}>
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <button
            onClick={() => onNavigate(item.id, item.type)}
            className={cn(
              "text-sm font-medium transition-colors px-2 py-1 rounded",
              index === path.length - 1
                ? "text-red-400 bg-red-950/30"
                : "text-gray-400 hover:text-red-400 hover:bg-red-950/20"
            )}
            style={{
              color: index === path.length - 1 && item.color ? item.color : undefined
            }}
          >
            {item.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}