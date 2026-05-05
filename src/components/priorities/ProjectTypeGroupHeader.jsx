import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Collapsible project-type group header matching Dashboard visual style.
 * Renders a color-coded border-left + border-bottom header with collapse toggle.
 */
export default function ProjectTypeGroupHeader({ typeName, typeColor, taskCount, children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-2 w-full text-left border-b-2 border-l-4 pl-3 mb-2 pb-1.5"
        style={{ borderColor: typeColor }}
      >
        {collapsed
          ? <ChevronRight className="w-4 h-4 shrink-0" style={{ color: typeColor }} />
          : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: typeColor }} />
        }
        <span className="text-base font-bold" style={{ color: typeColor }}>
          {typeName}
        </span>
        <span className="text-xs font-normal ml-1" style={{ color: typeColor, opacity: 0.7 }}>
          ({taskCount})
        </span>
      </button>
      {!collapsed && children}
    </div>
  );
}