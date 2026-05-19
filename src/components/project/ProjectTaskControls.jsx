import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Plus } from "lucide-react";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";

export default function ProjectTaskControls({
  groupBy,
  setGroupBy,
  subGroupBy,
  setSubGroupBy,
  onCreateTask,
  onManageBuckets,
}) {
  const isMobile = useIsMobile();

  return (
    <div className={cn("space-y-3", isMobile && "space-y-2")}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className={cn("font-bold text-white", isMobile ? "text-base" : "text-xl")}>Task Groups</h2>
          <p className="text-sm text-gray-400 hidden md:block">Organize and manage tasks</p>
        </div>
      </div>
      <div className={cn("flex flex-wrap gap-2", isMobile && "gap-1.5")}>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className={cn(
            "bg-gray-900/50 border-gray-700 text-white",
            isMobile ? "w-32 h-8 text-xs" : "w-40 text-sm"
          )}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buckets">Custom Buckets</SelectItem>
            <SelectItem value="status">Group by Status</SelectItem>
            <SelectItem value="assigned">Group by Assigned</SelectItem>
            <SelectItem value="category">Group by Category</SelectItem>
          </SelectContent>
        </Select>
        {groupBy === 'buckets' && (
          <Select value={subGroupBy} onValueChange={setSubGroupBy}>
            <SelectTrigger className={cn(
              "bg-gray-900/50 border-gray-700 text-white",
              isMobile ? "w-28 h-8 text-xs" : "w-36 text-sm"
            )}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Sub: Status</SelectItem>
              <SelectItem value="assigned">Sub: Assigned</SelectItem>
              <SelectItem value="category">Sub: Category</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          onClick={onCreateTask}
          size="sm"
          className={cn("bg-red-600 hover:bg-red-700 gap-2", isMobile && "h-8 px-2 text-xs")}
        >
          <Plus className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
          <span className="hidden sm:inline">New Task</span>
          <span className="sm:hidden">New</span>
        </Button>
        {groupBy === 'buckets' && (
          <Button
            onClick={onManageBuckets}
            size="sm"
            variant="outline"
            className={cn("border-gray-700 gap-2", isMobile && "h-8 px-2 text-xs")}
          >
            <Settings className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
            <span className="hidden sm:inline">Manage Buckets</span>
            <span className="sm:hidden">Manage</span>
          </Button>
        )}
      </div>
    </div>
  );
}