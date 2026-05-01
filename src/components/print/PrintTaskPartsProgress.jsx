import React from "react";
import { getTaskPartsProgressFromLinks } from "@/utils/taskPartsProgress";

/**
 * Shows "Parts: X of Y Installed" for a task in print views.
 * Uses pre-grouped taskPartLinksByTaskId map for O(1) lookup.
 * Hidden when task has no linked parts.
 */
export default function PrintTaskPartsProgress({ taskId, taskPartLinksByTaskId }) {
  const progress = getTaskPartsProgressFromLinks(taskPartLinksByTaskId[taskId]);
  if (!progress) return null;

  const { installed, total } = progress;
  const allDone = installed >= total;

  return (
    <div className="flex items-center gap-1.5 ml-6 py-0.5">
      <span className={`text-xs ${allDone ? "text-gray-500" : "text-gray-600 font-medium"}`}>
        Parts: {installed} of {total} Installed{allDone ? " ✓" : ""}
      </span>
      {total > 0 && (
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-600 rounded-full"
            style={{ width: `${Math.round((installed / total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}