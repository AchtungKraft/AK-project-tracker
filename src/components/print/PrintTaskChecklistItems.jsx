import React from "react";

/**
 * Renders incomplete checklist items under a task in print views.
 * Expects a pre-grouped map of checklistItemsByTaskId.
 */
export default function PrintTaskChecklistItems({ taskId, checklistItemsByTaskId }) {
  const items = checklistItemsByTaskId[taskId];
  if (!items || items.length === 0) return null;

  return items.map((item) => (
    <div key={item.id} className="flex items-start gap-2 py-0.5 ml-6">
      <div className="w-3 h-3 border border-gray-400 rounded-sm mt-0.5 shrink-0" />
      <div className="text-xs text-gray-600 leading-snug">{item.title}</div>
    </div>
  ));
}