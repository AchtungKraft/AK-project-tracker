import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import POTableRow from "./POTableRow";

export default function POStatusGroup({
  title,
  colorClass,
  orders,
  onNavigate,
  defaultCollapsed = false,
  showProject = false,
  forceCollapsed,
  onToggle,
}) {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);
  const collapsed = forceCollapsed !== undefined ? forceCollapsed : localCollapsed;
  const handleToggle = () => {
    if (onToggle) onToggle();
    else setLocalCollapsed(prev => !prev);
  };

  if (orders.length === 0) return null;

  return (
    <div>
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 mb-2 group"
      >
        <h2 className={cn("text-xs font-semibold uppercase tracking-wider", colorClass)}>
          {title}
        </h2>
        <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-600">
          {orders.length}
        </Badge>
        <span className="text-gray-600 text-xs group-hover:text-gray-400 transition-colors">
          {collapsed ? "Show" : "Hide"}
        </span>
      </button>
      {!collapsed && (
        <div className="rounded-lg border border-gray-700 overflow-hidden mb-4">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700 hover:bg-transparent bg-gray-900/50">
                <TableHead className="text-xs">PO #</TableHead>
                <TableHead className="text-xs">Vendor</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                {showProject && <TableHead className="text-xs">Project</TableHead>}
                <TableHead className="text-xs text-right">Cost</TableHead>
                <TableHead className="text-xs">Progress</TableHead>
                <TableHead className="text-xs">Billing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(po => (
                <POTableRow
                  key={po.order_id}
                  po={po}
                  onNavigate={onNavigate}
                  showProject={showProject}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}