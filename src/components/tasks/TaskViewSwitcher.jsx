import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, Calendar } from "lucide-react";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";

/**
 * TaskViewSwitcher
 * Reusable Card/Calendar view toggle for task displays
 * Used by both PriorityDashboard and ProjectDetail
 */
export default function TaskViewSwitcher({
  viewMode = "card",
  onViewChange,
  className = "",
}) {
  const isMobile = useIsMobile();

  return (
    <Tabs value={viewMode} onValueChange={onViewChange} className={cn("w-auto", className)}>
      <TabsList className={cn(
        "bg-gray-800/80 border border-gray-700 p-1",
        isMobile ? "h-9" : ""
      )}>
        <TabsTrigger 
          value="card" 
          className={cn(
            "data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-1.5",
            isMobile ? "px-2.5 text-xs" : "gap-2"
          )}
        >
          <LayoutGrid className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
          <span className={isMobile ? "" : "hidden sm:inline"}>
            {isMobile ? "" : "Card View"}
          </span>
        </TabsTrigger>
        <TabsTrigger 
          value="calendar" 
          className={cn(
            "data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-1.5",
            isMobile ? "px-2.5 text-xs" : "gap-2"
          )}
        >
          <Calendar className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
          <span className={isMobile ? "" : "hidden sm:inline"}>
            {isMobile ? "" : "Calendar View"}
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}