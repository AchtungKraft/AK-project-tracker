import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowRight, ArrowDownToLine, ArrowUpFromLine, Wrench, Package, Clock, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "../locationTypeConfig";
import moment from "moment";

const ACTION_CONFIGS = {
  receive:             { icon: ArrowDownToLine,   label: "Received",   color: "text-green-400" },
  move:                { icon: ArrowRight,         label: "Moved",      color: "text-blue-400" },
  ADD_STOCK:           { icon: ArrowDownToLine,   label: "Added",      color: "text-green-400" },
  REMOVE_STOCK:        { icon: ArrowUpFromLine,   label: "Removed",    color: "text-red-400" },
  ADJUST_STOCK_ADD:    { icon: Wrench,            label: "Adjusted +", color: "text-yellow-400" },
  ADJUST_STOCK_REMOVE: { icon: Wrench,            label: "Adjusted −", color: "text-yellow-400" },
  quantity_adjust:     { icon: Wrench,            label: "Adjusted",   color: "text-yellow-400" },
  install:             { icon: Package,           label: "Installed",  color: "text-purple-400" },
};

/**
 * RecentlyMovedView — shows recent inventory transfers/movements (last 48h).
 */
export default function RecentlyMovedView({ locations, parts, onNavigateLocation }) {
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['recentInventoryActivity'],
    queryFn: () => base44.entities.InventoryAuditLog.list('-performed_at', 50),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const partsMap = new Map(parts.map(p => [p.id, p]));
  const locsMap = new Map(locations.map(l => [l.id, l]));

  if (isLoading) {
    return <div className="text-sm text-gray-500 py-8 text-center">Loading recent activity…</div>;
  }

  if (auditLogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Inbox className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-base font-medium text-gray-400 mb-1">No recent activity</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          Inventory movements will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="text-sm font-semibold text-gray-300">
          Recent Inventory Activity
        </h3>
        <span className="text-xs text-gray-500">{auditLogs.length} entries</span>
      </div>

      {auditLogs.map(log => {
        const config = ACTION_CONFIGS[log.action_type] || { icon: Clock, label: log.action_type, color: "text-gray-400" };
        const ActionIcon = config.icon;
        const part = partsMap.get(log.part_id);
        const fromLoc = locsMap.get(log.from_location_id);
        const toLoc = locsMap.get(log.to_location_id);
        const loc = locsMap.get(log.location_id);
        const qty = log.qty_changed || log.qty_delta || 0;
        const date = log.performed_at || log.created_date;

        return (
          <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800/50">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-gray-800/60")}>
              <ActionIcon className={cn("w-3.5 h-3.5", config.color)} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("text-xs font-medium", config.color)}>{config.label}</span>
                {qty !== 0 && (
                  <span className="text-xs text-gray-400">×{Math.abs(qty)}</span>
                )}
              </div>
              
              {part && (
                <div className="text-sm text-gray-300 truncate mt-0.5">{part.part_name}</div>
              )}

              {/* Movement path */}
              {(fromLoc || toLoc) && (
                <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                  {fromLoc && (
                    <button
                      onClick={() => onNavigateLocation?.(fromLoc.id)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      {fromLoc.location_area}
                    </button>
                  )}
                  {fromLoc && toLoc && <ArrowRight className="w-3 h-3 text-gray-600" />}
                  {toLoc && (
                    <button
                      onClick={() => onNavigateLocation?.(toLoc.id)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      {toLoc.location_area}
                    </button>
                  )}
                </div>
              )}

              {!fromLoc && !toLoc && loc && (
                <button
                  onClick={() => onNavigateLocation?.(loc.id)}
                  className="text-[10px] text-gray-500 hover:text-white transition-colors mt-0.5"
                >
                  at {loc.location_area}
                </button>
              )}

              {log.notes && (
                <p className="text-[10px] text-gray-600 italic mt-1 line-clamp-1">{log.notes}</p>
              )}
            </div>

            <div className="text-right shrink-0">
              <div className="text-[10px] text-gray-600">{moment(date).fromNow()}</div>
              {log.performed_by && (
                <div className="text-[10px] text-gray-700 truncate max-w-[70px]">{log.performed_by}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}