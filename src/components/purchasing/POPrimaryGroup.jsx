import React, { useState } from "react";
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
  // pass-through for sub-group collapse
  subForceCollapsed,
  onSubToggle,
}) {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
  const collapsed = forceCollapsed !== undefined ? forceCollapsed : localCollapsed;
  const handleToggle = () => {
    if (onToggle) onToggle();
    else setLocalCollapsed(prev => !prev);
  };

  if (orders.length === 0) return null;

  // No sub-grouping — delegate directly to POStatusGroup
  if (!subGroups || subGroups.length === 0) {
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
  const totalCount = orders.length;

  return (
    <div>
      {/* Primary group header */}
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 mb-2 group"
      >
        {collapsed
          ? <ChevronRight className={cn("w-3.5 h-3.5", colorClass)} />
          : <ChevronDown className={cn("w-3.5 h-3.5", colorClass)} />
        }
        <h2 className={cn("text-xs font-semibold uppercase tracking-wider", colorClass)}>
          {title}
        </h2>
        <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-600">
          {totalCount}
        </Badge>
        <span className="text-gray-600 text-xs group-hover:text-gray-400 transition-colors">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>

      {!collapsed && (
        <div className="ml-4 border-l border-gray-700/50 pl-3 space-y-3 mb-4">
          {subGroups.map(sg => (
            sg.orders.length > 0 && (
              <POStatusGroup
                key={sg.key}
                title={sg.title}
                colorClass={sg.colorClass || "text-gray-400"}
                orders={sg.orders}
                onNavigate={onNavigate}
                showProject={showProject}
                defaultCollapsed={false}
                forceCollapsed={subForceCollapsed}
                onToggle={onSubToggle}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}