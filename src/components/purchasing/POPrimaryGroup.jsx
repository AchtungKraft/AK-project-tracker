import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown } from "lucide-react";
import POStatusGroup from "./POStatusGroup";

/**
 * POPrimaryGroup — outer grouping wrapper.
 * If subGroups is provided, renders nested POStatusGroup tables.
 * If not, renders a single POStatusGroup directly.
 */
export default function POPrimaryGroup({
  title,
  colorClass,
  orders,
  subGroups,
  onNavigate,
  showProject,
  defaultCollapsed = false,
  forceCollapsed,
  onToggle,
}) {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
  const collapsed = forceCollapsed !== undefined ? forceCollapsed : localCollapsed;

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setLocalCollapsed(prev => !prev);
  };

  // Filter out empty sub-groups once
  const visibleSubGroups = useMemo(() => {
    if (!subGroups) return null;
    return subGroups.filter(sg => sg.orders.length > 0);
  }, [subGroups]);

  if (orders.length === 0) return null;

  // No sub-grouping — delegate directly to POStatusGroup
  if (!visibleSubGroups || visibleSubGroups.length === 0) {
    return (
      <POStatusGroup
        title={title}
        colorClass={colorClass}
        orders={orders}
        onNavigate={onNavigate}
        showProject={showProject}
        defaultCollapsed={defaultCollapsed}
        forceCollapsed={forceCollapsed}
        onToggle={onToggle}
      />
    );
  }

  // With sub-grouping — render primary header + nested sub-groups
  return (
    <div className="mb-2">
      {/* Primary group header — bold / uppercase */}
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 mb-3 group w-full text-left"
      >
        {collapsed
          ? <ChevronRight className={cn("w-4 h-4", colorClass)} />
          : <ChevronDown className={cn("w-4 h-4", colorClass)} />
        }
        <h2 className={cn("text-sm font-bold uppercase tracking-wider", colorClass)}>
          {title}
        </h2>
        <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-600">
          {orders.length}
        </Badge>
        <span className="text-gray-600 text-xs group-hover:text-gray-400 transition-colors ml-auto mr-2">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed && (
        <div className="ml-5 pl-4 border-l-2 border-gray-700/40 space-y-4 mb-5">
          {visibleSubGroups.map(sg => (
            <POStatusGroup
              key={sg.key}
              title={sg.title}
              colorClass={sg.colorClass || "text-gray-400"}
              orders={sg.orders}
              onNavigate={onNavigate}
              showProject={showProject}
              defaultCollapsed={false}
              forceCollapsed={forceCollapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
}