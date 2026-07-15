import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, Calendar, ClipboardCheck, Flame, ListChecks } from "lucide-react";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";

/**
 * TaskViewSwitcher
 * Reusable Card/Calendar/Execution/Shop/Workload view toggle for task displays
 * Used by both PriorityDashboard and ProjectDetail
 */
export default function TaskViewSwitcher({
  viewMode = "card",
  onViewChange,
  className = "",
  showExecution = false,
  showShop = false,
  showWorkload = false,
}) {
  const isMobile = useIsMobile();

  const triggerClass = cn(
    "data-[state=active]:bg-red-600 data-[state=active]:text-white text-gray-300 gap-1.5",
    isMobile ? "px-2 py-1 text-xs h-7" : "gap-2"
  );
  const iconClass = isMobile ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <Tabs value={viewMode} onValueChange={(mode) => onViewChange(mode)} className={cn("w-auto", className)}>
      <TabsList className={cn(
        "bg-gray-800/80 border border-gray-700 p-1",
        isMobile ? "h-9 overflow-x-auto" : ""
      )}>
        {showWorkload && (
          <TabsTrigger value="workload" className={triggerClass}>
            <ListChecks className={iconClass} />
            {!isMobile && <span className="hidden sm:inline">Workload</span>}
          </TabsTrigger>
        )}
        <TabsTrigger value="card" className={triggerClass}>
          <LayoutGrid className={iconClass} />
          {!isMobile && <span className="hidden sm:inline">Card View</span>}
        </TabsTrigger>
        <TabsTrigger value="calendar" className={triggerClass}>
          <Calendar className={iconClass} />
          {!isMobile && <span className="hidden sm:inline">Calendar</span>}
        </TabsTrigger>
        {showExecution && (
          <TabsTrigger value="execution" className={triggerClass}>
            <ClipboardCheck className={iconClass} />
            {!isMobile && <span className="hidden sm:inline">Execution</span>}
          </TabsTrigger>
        )}
        {showShop && (
          <TabsTrigger value="shop" className={triggerClass}>
            <Flame className={iconClass} />
            {!isMobile && <span className="hidden sm:inline">Shop</span>}
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );
}