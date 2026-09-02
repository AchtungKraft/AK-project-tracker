import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowRight, Clock, Package, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shows recent project-related physical movements from InventoryTransfer.
 */
export default function ProjectStorageRecentMoves({ projectId, locations, containers, parts }) {
  const { data: transfers = [] } = useQuery({
    queryKey: ['projectTransfers', projectId],
    queryFn: () => base44.entities.InventoryTransfer.filter({ project_id: projectId }, '-created_date', 20),
    staleTime: 30000,
    enabled: !!projectId,
  });

  const recent = transfers.slice(0, 10);

  if (recent.length === 0) {
    return (
      <div className="text-center py-6">
        <Clock className="w-8 h-8 text-gray-700 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">No recent movements for this project</p>
      </div>
    );
  }

  const locName = (id) => locations.find(l => l.id === id)?.location_area || id?.slice(0, 8) || '?';
  const ctrName = (id) => containers?.find(c => c.id === id)?.name;
  const partName = (id) => {
    if (id === 'CONTAINER_MOVE') return 'Container Move';
    return parts?.find(p => p.id === id)?.part_name || 'Unknown Part';
  };

  const typeLabel = (t) => {
    const map = {
      project_stage: 'Staged',
      return_to_stock: 'Returned',
      put_away: 'Put Away',
      inventory_move: 'Moved',
      container_move: 'Container Move',
    };
    return map[t] || t;
  };

  const typeColor = (t) => {
    if (t === 'project_stage') return 'text-green-400 bg-green-950/20';
    if (t === 'return_to_stock') return 'text-amber-400 bg-amber-950/20';
    if (t === 'container_move') return 'text-purple-400 bg-purple-950/20';
    return 'text-gray-400 bg-gray-800/50';
  };

  return (
    <div className="space-y-1.5">
      {recent.map(t => (
        <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/30 text-xs">
          <div className={cn("px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0", typeColor(t.transfer_type))}>
            {typeLabel(t.transfer_type)}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-gray-300 truncate block">
              {t.part_id === 'CONTAINER_MOVE'
                ? (ctrName(t.container_id) || 'Container')
                : `${partName(t.part_id)} × ${t.qty_moved}`}
            </span>
            <span className="text-gray-600 truncate block">
              {ctrName(t.from_container_id) || locName(t.from_location_id)}
              {' → '}
              {ctrName(t.to_container_id) || locName(t.to_location_id)}
            </span>
          </div>
          <span className="text-gray-600 text-[10px] shrink-0">
            {t.performed_at ? new Date(t.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}