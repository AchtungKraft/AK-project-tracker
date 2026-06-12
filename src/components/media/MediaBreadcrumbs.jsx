import React from "react";
import { ChevronRight, Home } from "lucide-react";

export default function MediaBreadcrumbs({ currentPath, onNavigate }) {
  const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];

  return (
    <div className="flex items-center gap-1 text-sm text-gray-400 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onNavigate("")}
        className="flex items-center gap-1 hover:text-purple-400 transition-colors whitespace-nowrap flex-shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Images</span>
      </button>
      <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
      <button
        onClick={() => onNavigate("")}
        className="hover:text-purple-400 transition-colors whitespace-nowrap flex-shrink-0"
      >
        Public
      </button>
      {parts.map((part, idx) => {
        const path = parts.slice(0, idx + 1).join('/');
        const isLast = idx === parts.length - 1;
        return (
          <React.Fragment key={path}>
            <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
            <button
              onClick={() => onNavigate(path)}
              className={`whitespace-nowrap flex-shrink-0 transition-colors ${
                isLast ? 'text-purple-400 font-medium' : 'hover:text-purple-400'
              }`}
            >
              {part}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}