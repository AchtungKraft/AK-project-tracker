import React, { useState } from "react";
import { ChevronDown, ChevronRight, Printer } from "lucide-react";

/**
 * Collapsible project-type group header matching Dashboard visual style.
 * Renders a color-coded border-left + border-bottom header with collapse toggle.
 * projectIds: optional array of project IDs for group-level print.
 */
export default function ProjectTypeGroupHeader({ typeName, typeColor, taskCount, projectIds = [], children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handlePrintGroup = (e) => {
    e.stopPropagation();
    projectIds.forEach(id => {
      window.open(`/projectprintview?id=${id}`, '_blank');
    });
  };

  return (
    <div className="mb-4">
      <div
        className="flex items-center gap-2 w-full border-b-2 border-l-4 pl-3 mb-2 pb-1.5"
        style={{ borderColor: typeColor }}
      >
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
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
        {projectIds.length > 0 && (
          <button
            onClick={handlePrintGroup}
            className="text-[10px] text-gray-500 hover:text-white transition-colors shrink-0 px-1.5 py-0.5 rounded hover:bg-gray-800 flex items-center gap-1"
            title={`Print checklists for all ${projectIds.length} projects`}
          >
            <Printer className="w-3 h-3" />
          </button>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}