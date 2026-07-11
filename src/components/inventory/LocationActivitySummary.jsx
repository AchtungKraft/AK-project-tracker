import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowDownToLine, ArrowUpFromLine, Wrench, Package, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";

const ACTION_ICONS = {
  receive: ArrowDownToLine,
  move: ArrowUpFromLine,
  ADD_STOCK: ArrowDownToLine,
  REMOVE_STOCK: ArrowUpFromLine,
  ADJUST_STOCK_ADD: Wrench,
  ADJUST_STOCK_REMOVE: Wrench,
  quantity_adjust: Wrench,
  install: Package,
};

const ACTION_LABELS = {
  receive: "Received",
  move: "Moved",
  ADD_STOCK: "Added",
  REMOVE_STOCK: "Removed",
  ADJUST_STOCK_ADD: "Adjusted +",
  ADJUST_STOCK_REMOVE: "Adjusted −",
  quantity_adjust: "Adjusted",
  install: "Installed",
};

export default function LocationActivitySummary({ locationId, parts = [] }) {
  // Query audit logs scoped to this location only
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['locationActivity', locationId],
    queryFn: async () => {
      // Query logs where this location was involved (location_id, from_location_id, or to_location_id)
      const [byLocation, byTo, byFrom] = await Promise.all([
        base44.entities.InventoryAuditLog.filter({ location_id: locationId }, '-performed_at', 5),
        base44.entities.InventoryAuditLog.filter({ to_location_id: locationId }, '-performed_at', 5),
        base44.entities.InventoryAuditLog.filter({ from_location_id: locationId }, '-performed_at', 5),
      ]);
      // Merge and deduplicate
      const seen = new Set();
      const all = [];
      [...byLocation, ...byTo, ...byFrom].forEach(log => {
        if (!seen.has(log.id)) {
          seen.add(log.id);
          all.push(log);
        }
      });
      return all.sort((a, b) => new Date(b.performed_at || b.created_date) - new Date(a.performed_at || a.created_date)).slice(0, 5);
    },
    enabled: !!locationId,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="text-xs text-gray-500 py-2">Loading activity…</div>
    );
  }

  if (auditLogs.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 py-2">
        <Clock className="w-3.5 h-3.5" />
        No recent activity at this location
      </div>
    );
  }

  const partsMap = new Map(parts.map(p => [p.id, p]));

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Recent Activity
      </h4>
      <div className="space-y-1.5">
        {auditLogs.map(log => {
          const ActionIcon = ACTION_ICONS[log.action_type] || Clock;
          const label = ACTION_LABELS[log.action_type] || log.action_type;
          const part = partsMap.get(log.part_id);
          const qty = log.qty_changed || log.qty_delta || 0;
          const date = log.performed_at || log.created_date;
          const isIncoming = log.to_location_id === locationId;
          const isOutgoing = log.from_location_id === locationId && log.to_location_id !== locationId;

          return (
            <div
              key={log.id}
              className="flex items-start gap-2 px-3 py-2 bg-gray-800/30 rounded text-xs"
            >
              <ActionIcon className={cn(
                "w-3.5 h-3.5 mt-0.5 shrink-0",
                isOutgoing ? "text-red-400" : isIncoming ? "text-green-400" : "text-gray-400"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "font-medium",
                    isOutgoing ? "text-red-300" : isIncoming ? "text-green-300" : "text-gray-300"
                  )}>
                    {label}
                  </span>
                  {qty !== 0 && (
                    <span className="text-gray-400">
                      ×{Math.abs(qty)}
                    </span>
                  )}
                </div>
                {part && (
                  <div className="text-gray-500 truncate">{part.part_name}</div>
                )}
                {log.notes && (
                  <div className="text-gray-600 italic truncate">{log.notes}</div>
                )}
              </div>
              <div className="text-gray-600 shrink-0 text-right">
                <div>{moment(date).fromNow()}</div>
                {log.performed_by && (
                  <div className="text-gray-700 truncate max-w-[80px]">{log.performed_by}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}