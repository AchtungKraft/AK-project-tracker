import React from "react";

/**
 * Shows "Parts: X of Y Installed" for a task in print views.
 * Uses pre-grouped taskPartLinksByTaskId map for O(1) lookup.
 * Hidden when task has no linked parts.
 */
export default function PrintTaskPartsProgress({ taskId, taskPartLinksByTaskId }) {
  const links = taskPartLinksByTaskId[taskId];
  if (!links || links.length === 0) return null;

  let totalQty = 0;
  let installedQty = 0;

  links.forEach(link => {
    const needed = link.qty_allocated || 1;
    const installed = Math.min(link.qty_installed || 0, needed);
    totalQty += needed;
    installedQty += installed;
  });

  const allDone = installedQty >= totalQty;

  return (
    <div className="flex items-center gap-1.5 ml-6 py-0.5">
      <span className={`text-xs ${allDone ? "text-gray-500" : "text-gray-600 font-medium"}`}>
        Parts: {installedQty} of {totalQty} Installed
      </span>
      {/* Simple progress bar */}
      {totalQty > 0 && (
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-600 rounded-full"
            style={{ width: `${Math.round((installedQty / totalQty) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}