import React from "react";
import { ChevronRight, Settings } from "lucide-react";
import { ADMIN_GROUPS } from "./AdminSidebar";

export default function AdminBreadcrumb({ activeKey }) {
  // Find group and item for the active key
  let groupLabel = "";
  let itemLabel = "";

  for (const group of ADMIN_GROUPS) {
    const item = group.items.find(i => i.key === activeKey);
    if (item) {
      groupLabel = group.label;
      itemLabel = item.label;
      break;
    }
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
      <Settings className="w-3.5 h-3.5" />
      <span>Admin</span>
      {groupLabel && (
        <>
          <ChevronRight className="w-3 h-3" />
          <span>{groupLabel}</span>
        </>
      )}
      {itemLabel && (
        <>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-300">{itemLabel}</span>
        </>
      )}
    </div>
  );
}