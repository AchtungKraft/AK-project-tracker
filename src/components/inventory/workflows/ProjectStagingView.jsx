import React, { useMemo } from "react";
import { FolderKanban, Package, MapPin, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

/**
 * ProjectStagingView — shows projects with reserved/pending inventory.
 * Helps parts managers see which projects need staging attention.
 */
export default function ProjectStagingView({ locations, inventoryItems, parts, projects, commitments, onNavigateLocation }) {
  const navigate = useNavigate();

  const projectStats = useMemo(() => {
    // Get project storage locations
    const projectLocMap = new Map();
    locations.forEach(loc => {
      if (loc.project_id && loc.active !== false) {
        if (!projectLocMap.has(loc.project_id)) projectLocMap.set(loc.project_id, []);
        projectLocMap.get(loc.project_id).push(loc);
      }
    });

    // Build commitment stats per project
    const projectData = new Map();
    (commitments || []).forEach(c => {
      if (!c.project_id) return;
      const required = c.required_total || 0;
      const installed = c.qty_installed || 0;
      const reserved = c.reserved_from_stock || 0;
      const remaining = Math.max(0, required - installed);
      if (remaining === 0) return;

      if (!projectData.has(c.project_id)) {
        projectData.set(c.project_id, { 
          totalRequired: 0, totalInstalled: 0, totalReserved: 0,
          totalRemaining: 0, commitmentCount: 0
        });
      }
      const pd = projectData.get(c.project_id);
      pd.totalRequired += required;
      pd.totalInstalled += installed;
      pd.totalReserved += reserved;
      pd.totalRemaining += remaining;
      pd.commitmentCount++;
    });

    // Build enriched project data
    return Array.from(projectData.entries())
      .map(([projectId, stats]) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return null;
        
        const projectLocs = projectLocMap.get(projectId) || [];
        
        // Count parts physically at project storage
        const projectLocIds = new Set(projectLocs.map(l => l.id));
        const stagedItems = inventoryItems.filter(i => 
          projectLocIds.has(i.location_id) && (i.quantity_on_hand || 0) > 0
        );
        const stagedUnits = stagedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
        const stagedParts = new Set(stagedItems.map(i => i.part_id)).size;

        const completionPct = stats.totalRequired > 0 
          ? Math.round((stats.totalInstalled / stats.totalRequired) * 100) 
          : 0;

        return {
          project,
          ...stats,
          projectLocs,
          stagedUnits,
          stagedParts,
          completionPct,
          needsStaging: stats.totalReserved > 0 && stagedParts < stats.commitmentCount,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        // Needs staging first, then by remaining
        if (a.needsStaging !== b.needsStaging) return a.needsStaging ? -1 : 1;
        return b.totalRemaining - a.totalRemaining;
      });
  }, [locations, inventoryItems, parts, projects, commitments]);

  if (projectStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <FolderKanban className="w-12 h-12 text-gray-600 mb-3" />
        <h3 className="text-base font-medium text-gray-400 mb-1">No active staging</h3>
        <p className="text-sm text-gray-600 max-w-sm">
          Projects with reserved inventory will appear here for staging.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-sm font-semibold text-gray-300">
          {projectStats.length} project{projectStats.length !== 1 ? 's' : ''} with pending inventory
        </h3>
      </div>

      {projectStats.map(ps => (
        <div
          key={ps.project.id}
          className={cn(
            "p-4 rounded-xl border transition-colors",
            ps.needsStaging 
              ? "border-purple-800/40 bg-purple-950/10"
              : "border-gray-800 bg-gray-900/40"
          )}
        >
          {/* Project Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-white truncate">{ps.project.name}</h4>
              {ps.project.client_name && (
                <span className="text-xs text-gray-500">{ps.project.client_name}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                ps.completionPct >= 80 ? "bg-green-900/50 text-green-400" 
                  : ps.completionPct >= 40 ? "bg-yellow-900/50 text-yellow-400"
                  : "bg-gray-800 text-gray-400"
              )}>
                {ps.completionPct}%
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-gray-800 rounded-full mb-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all"
              style={{ width: `${ps.completionPct}%` }}
            />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-2 text-center mb-3">
            <div className="bg-gray-800/40 rounded-lg p-2">
              <div className="text-sm font-bold text-white">{ps.commitmentCount}</div>
              <div className="text-[10px] text-gray-500">Parts</div>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2">
              <div className="text-sm font-bold text-orange-400">{ps.totalReserved}</div>
              <div className="text-[10px] text-gray-500">Reserved</div>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2">
              <div className="text-sm font-bold text-purple-400">{ps.stagedUnits}</div>
              <div className="text-[10px] text-gray-500">Staged</div>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2">
              <div className="text-sm font-bold text-gray-400">{ps.totalRemaining}</div>
              <div className="text-[10px] text-gray-500">Remaining</div>
            </div>
          </div>

          {/* Project Storage Locations */}
          {ps.projectLocs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ps.projectLocs.slice(0, 4).map(loc => (
                <button
                  key={loc.id}
                  onClick={() => onNavigateLocation?.(loc.id)}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-800/60 rounded-lg text-[10px] text-gray-300 hover:bg-gray-700/60 transition-colors"
                >
                  <MapPin className="w-3 h-3" style={{ color: loc.color || '#E879F9' }} />
                  {loc.location_area}
                </button>
              ))}
              {ps.projectLocs.length > 4 && (
                <span className="text-[10px] text-gray-500 px-1 py-1">+{ps.projectLocs.length - 4} more</span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {ps.projectLocs.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigateLocation?.(ps.projectLocs[0].id)}
                className="text-xs text-purple-400 hover:text-purple-300 h-8"
              >
                <FolderKanban className="w-3.5 h-3.5 mr-1" />
                View Storage
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/projectdetail?id=${ps.project.id}`)}
              className="text-xs text-gray-400 hover:text-white h-8"
            >
              <ArrowRight className="w-3.5 h-3.5 mr-1" />
              Project
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}