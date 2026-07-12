import React, { useMemo } from "react";
import { CheckCircle2, Package, MapPin, FolderKanban, ArrowRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "../locationTypeConfig";

const STAGED_TYPES = ['staging', 'project_storage', 'project_shelf', 'project_cart', 'engine_stand', 'body_buck', 'parts_tote'];

/**
 * ReadyToInstallView — inventory that is reserved and physically at project/staging locations.
 * Grouped by project, then by location.
 */
export default function ReadyToInstallView({ locations, inventoryItems, parts, projects, commitments, onNavigateLocation }) {
  const groupedData = useMemo(() => {
    const partsMap = new Map(parts.map(p => [p.id, p]));
    const locsMap = new Map(locations.map(l => [l.id, l]));

    // Staged location IDs
    const stagedLocIds = new Set();
    locations.forEach(loc => {
      if (loc.active !== false && STAGED_TYPES.includes(loc.location_type)) {
        stagedLocIds.add(loc.id);
      }
    });

    // Find reserved items at staged locations
    const readyItems = inventoryItems.filter(i =>
      stagedLocIds.has(i.location_id) && (i.quantity_reserved || 0) > 0
    );

    // Build part→project map from commitments
    const partProjectMap = new Map();
    (commitments || []).forEach(c => {
      if ((c.reserved_from_stock || 0) > 0) {
        if (!partProjectMap.has(c.part_id)) partProjectMap.set(c.part_id, new Set());
        partProjectMap.get(c.part_id).add(c.project_id);
      }
    });

    // Group by project
    const projectGroups = new Map();
    readyItems.forEach(item => {
      const projectIds = partProjectMap.get(item.part_id);
      const projectId = projectIds?.values().next().value || 'unassigned';

      if (!projectGroups.has(projectId)) {
        projectGroups.set(projectId, { items: [], locationGroups: new Map() });
      }
      const group = projectGroups.get(projectId);
      group.items.push(item);

      const locKey = item.location_id || 'unknown';
      if (!group.locationGroups.has(locKey)) {
        group.locationGroups.set(locKey, []);
      }
      group.locationGroups.get(locKey).push(item);
    });

    return Array.from(projectGroups.entries())
      .map(([projectId, data]) => {
        const project = projects.find(p => p.id === projectId);
        return {
          projectId,
          project,
          projectName: project?.name || 'Unassigned',
          clientName: project?.client_name,
          totalParts: new Set(data.items.map(i => i.part_id)).size,
          totalUnits: data.items.reduce((s, i) => s + (i.quantity_reserved || 0), 0),
          locationGroups: Array.from(data.locationGroups.entries()).map(([locId, items]) => ({
            location: locsMap.get(locId),
            items: items.map(i => ({
              ...i,
              part: partsMap.get(i.part_id),
            })).filter(i => i.part),
          })),
        };
      })
      .sort((a, b) => b.totalUnits - a.totalUnits);
  }, [locations, inventoryItems, parts, projects, commitments]);

  if (groupedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Inbox className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-base font-medium text-gray-400 mb-1">Nothing ready to install</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          No inventory is currently staged and reserved. Parts will appear here when they're at project storage and reserved for a build.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-sm font-semibold text-gray-300">
          {groupedData.reduce((s, g) => s + g.totalParts, 0)} parts ready across {groupedData.length} project{groupedData.length !== 1 ? 's' : ''}
        </h3>
      </div>

      {groupedData.map(group => (
        <div key={group.projectId} className="rounded-xl border border-gray-800 bg-gray-900/30 overflow-hidden">
          {/* Project Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-800/30 border-b border-gray-800">
            <FolderKanban className="w-4 h-4 text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-white">{group.projectName}</span>
              {group.clientName && (
                <span className="text-xs text-gray-500 ml-2">({group.clientName})</span>
              )}
            </div>
            <Badge variant="outline" className="text-xs border-green-700/50 text-green-400">
              {group.totalParts} parts · {group.totalUnits} units
            </Badge>
          </div>

          {/* Location Groups */}
          <div className="divide-y divide-gray-800/50">
            {group.locationGroups.map(lg => {
              const tc = lg.location ? getLocationTypeConfig(lg.location.location_type) : null;
              const LocIcon = tc?.icon || MapPin;

              return (
                <div key={lg.location?.id || 'unknown'} className="p-3">
                  {/* Location header */}
                  {lg.location && (
                    <button
                      onClick={() => onNavigateLocation?.(lg.location.id)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors mb-2"
                    >
                      <LocIcon className="w-3.5 h-3.5" style={{ color: lg.location.color || tc?.color }} />
                      <span>{lg.location.location_area}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}

                  {/* Parts list */}
                  <div className="space-y-1.5">
                    {lg.items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 text-xs">
                        <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center shrink-0">
                          {item.part.featured_photo ? (
                            <img src={item.part.featured_photo} alt="" className="w-6 h-6 rounded object-cover" />
                          ) : (
                            <Package className="w-3 h-3 text-gray-600" />
                          )}
                        </div>
                        <span className="text-gray-300 truncate flex-1">{item.part.part_name}</span>
                        <span className="text-green-400 font-medium shrink-0">{item.quantity_reserved} rdy</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}