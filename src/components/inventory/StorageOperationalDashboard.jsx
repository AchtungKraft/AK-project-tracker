import React, { useMemo } from "react";
import { 
  ArrowDownToLine, ClipboardCheck, PackageOpen, FolderKanban, 
  Package, ShoppingCart, Wrench, Truck, RotateCcw, 
  AlertTriangle, Inbox, Clock, ArrowRight, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "./locationTypeConfig";

const WORKFLOW_CONFIGS = [
  { key: 'receiving',      label: 'Receiving',          icon: ArrowDownToLine,  color: '#22C55E', types: ['receiving'],  
    description: 'Incoming inventory' },
  { key: 'inspection',     label: 'Inspection',         icon: ClipboardCheck,   color: '#F59E0B', types: ['inspection'], 
    description: 'Awaiting inspection' },
  { key: 'putAway',        label: 'Put Away',           icon: PackageOpen,      color: '#8B5CF6', types: [],            
    description: 'Needs permanent storage' },
  { key: 'projectStaging', label: 'Project Staging',    icon: FolderKanban,     color: '#A855F7', types: ['staging'],    
    description: 'Ready for projects' },
  { key: 'warehouse',      label: 'Warehouse',          icon: Package,          color: '#3B82F6', types: ['warehouse', 'shelf', 'rack', 'bin', 'aisle', 'cabinet', 'drawer'], 
    description: 'General storage' },
  { key: 'projectStorage', label: 'Project Storage',    icon: FolderKanban,     color: '#E879F9', types: ['project_storage', 'project_shelf', 'project_cart', 'engine_stand', 'body_buck', 'parts_tote'], 
    description: 'Project-assigned storage' },
  { key: 'techCarts',      label: 'Technician Carts',   icon: ShoppingCart,     color: '#EF4444', types: ['cart', 'engine_cart', 'body_cart', 'tech_cart'], 
    description: 'Mobile work carts' },
  { key: 'readyToInstall', label: 'Ready to Install',   icon: CheckCircle2,     color: '#10B981', types: ['staging'],    
    description: 'Staged & available' },
  { key: 'shipping',       label: 'Shipping',           icon: Truck,            color: '#06B6D4', types: ['shipping'],   
    description: 'Outbound logistics' },
  { key: 'returns',        label: 'Returns',            icon: RotateCcw,        color: '#F97316', types: [],             
    description: 'Returns & removals' },
  { key: 'unassigned',     label: 'Unassigned',         icon: AlertTriangle,    color: '#EAB308', types: [],             
    description: 'No location assigned' },
  { key: 'recentlyMoved',  label: 'Recently Moved',     icon: Clock,            color: '#94A3B8', types: [],             
    description: 'Recent transfers' },
];

export default function StorageOperationalDashboard({ 
  locations, inventoryItems, commitments = [], projects = [], 
  onSelectWorkflow, activeWorkflow 
}) {
  const stats = useMemo(() => {
    const result = {};
    
    // Build type → location IDs map
    const typeLocMap = {};
    locations.forEach(loc => {
      if (loc.active === false) return;
      const t = loc.location_type || 'other';
      if (!typeLocMap[t]) typeLocMap[t] = [];
      typeLocMap[t].push(loc.id);
    });

    // Standard zone stats
    WORKFLOW_CONFIGS.forEach(wf => {
      if (wf.types.length === 0) {
        result[wf.key] = { partCount: 0, totalUnits: 0, locationCount: 0, hasActivity: false };
        return;
      }
      const locIds = new Set();
      wf.types.forEach(t => (typeLocMap[t] || []).forEach(id => locIds.add(id)));
      const items = inventoryItems.filter(i => locIds.has(i.location_id) && (i.quantity_on_hand || 0) > 0);
      const partCount = new Set(items.map(i => i.part_id)).size;
      const totalUnits = items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
      result[wf.key] = { locIds, partCount, totalUnits, locationCount: locIds.size, hasActivity: partCount > 0 };
    });

    // Put Away: items in receiving/inspection that have stock but no permanent location
    const receivingLocIds = new Set();
    ['receiving', 'inspection'].forEach(t => (typeLocMap[t] || []).forEach(id => receivingLocIds.add(id)));
    const putAwayItems = inventoryItems.filter(i => 
      (i.quantity_on_hand || 0) > 0 && (receivingLocIds.has(i.location_id) || !i.location_id)
    );
    result.putAway = { 
      partCount: new Set(putAwayItems.map(i => i.part_id)).size,
      totalUnits: putAwayItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
      locationCount: 0,
      hasActivity: putAwayItems.length > 0,
    };

    // Unassigned
    const unassigned = inventoryItems.filter(i => !i.location_id && (i.quantity_on_hand || 0) > 0);
    result.unassigned = { 
      partCount: new Set(unassigned.map(i => i.part_id)).size,
      totalUnits: unassigned.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
      locationCount: 0,
      hasActivity: unassigned.length > 0,
    };

    // Ready to Install: reserved items at staging/project storage
    const stagingLocIds = new Set();
    ['staging', 'project_storage', 'project_shelf', 'project_cart'].forEach(t => 
      (typeLocMap[t] || []).forEach(id => stagingLocIds.add(id))
    );
    const reservedItems = inventoryItems.filter(i => 
      stagingLocIds.has(i.location_id) && (i.quantity_reserved || 0) > 0
    );
    result.readyToInstall = {
      partCount: new Set(reservedItems.map(i => i.part_id)).size,
      totalUnits: reservedItems.reduce((s, i) => s + (i.quantity_reserved || 0), 0),
      locationCount: 0,
      hasActivity: reservedItems.length > 0,
    };

    // Returns: items from removed parts (source_type = vehicle_removed)
    const removedItems = inventoryItems.filter(i => 
      i.source_type === 'vehicle_removed' && (i.quantity_on_hand || 0) > 0
    );
    result.returns = {
      partCount: new Set(removedItems.map(i => i.part_id)).size,
      totalUnits: removedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
      locationCount: 0,
      hasActivity: removedItems.length > 0,
    };

    // Recently Moved: count of items updated in last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentItems = inventoryItems.filter(i => 
      (i.quantity_on_hand || 0) > 0 && i.updated_date && i.updated_date > cutoff
    );
    result.recentlyMoved = {
      partCount: new Set(recentItems.map(i => i.part_id)).size,
      totalUnits: recentItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
      locationCount: 0,
      hasActivity: recentItems.length > 0,
    };

    // Project Staging: projects with active commitments
    const projectsWithCommitments = new Set();
    (commitments || []).forEach(c => {
      if ((c.reserved_from_stock || 0) > 0) projectsWithCommitments.add(c.project_id);
    });
    result.projectStaging = {
      ...result.projectStaging,
      partCount: projectsWithCommitments.size,
      hasActivity: projectsWithCommitments.size > 0,
    };

    return result;
  }, [locations, inventoryItems, commitments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Storage Operations
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {WORKFLOW_CONFIGS.map(wf => {
          const s = stats[wf.key] || { partCount: 0, totalUnits: 0 };
          const Icon = wf.icon;
          const isActive = activeWorkflow === wf.key;
          const hasItems = s.partCount > 0 || s.hasActivity;
          const isUrgent = ['putAway', 'unassigned', 'returns'].includes(wf.key) && hasItems;

          return (
            <button
              key={wf.key}
              onClick={() => onSelectWorkflow(wf.key)}
              className={cn(
                "flex flex-col gap-2 p-4 rounded-xl border transition-all text-left group",
                isActive
                  ? "border-red-600/60 bg-red-950/30 ring-1 ring-red-600/30"
                  : isUrgent
                    ? "border-yellow-700/40 bg-yellow-950/10 hover:border-yellow-600/50"
                    : hasItems
                      ? "border-gray-700 bg-gray-900/40 hover:border-gray-600 hover:bg-gray-900/60"
                      : "border-gray-800/60 bg-gray-900/20 hover:border-gray-700"
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "bg-red-900/50" : "bg-gray-800/60 group-hover:bg-gray-700/60"
                )}>
                  <Icon className="w-4.5 h-4.5" style={{ color: wf.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{wf.label}</div>
                  <div className="text-[10px] text-gray-500">{wf.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs mt-1">
                {s.partCount > 0 ? (
                  <>
                    <span className="text-gray-400">
                      <span className={cn(
                        "font-semibold",
                        isUrgent ? "text-yellow-400" : "text-white"
                      )}>{s.partCount}</span>
                      {' '}{wf.key === 'projectStaging' ? 'projects' : 'parts'}
                    </span>
                    {s.totalUnits > 0 && wf.key !== 'projectStaging' && (
                      <span className="text-gray-500">
                        {s.totalUnits} units
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-600">Empty</span>
                )}
              </div>

              {isActive && (
                <div className="flex items-center gap-1 text-[10px] text-red-400 mt-0.5">
                  <ArrowRight className="w-3 h-3" />
                  Active
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { WORKFLOW_CONFIGS };