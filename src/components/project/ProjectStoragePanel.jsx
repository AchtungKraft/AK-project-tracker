import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Plus, Loader2, MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getLocationTypeConfig } from "@/components/inventory/locationTypeConfig";
import { getActiveProjectStorageTemplates } from "@/components/admin/ProjectStorageTemplatesConfig";
import LocationBreadcrumb from "@/components/inventory/LocationBreadcrumb";

export default function ProjectStoragePanel({ projectId, projectName }) {
  const queryClient = useQueryClient();
  const [isInitializing, setIsInitializing] = useState(false);

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const { data: commitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.filter({
      project_id: projectId,
      commitment_status: { $nin: ['cancelled', 'closed'] }
    }),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    enabled: !!projectId,
  });

  // Project storage locations
  const storageLocations = useMemo(() =>
    locations
      .filter(l => l.project_id === projectId && l.is_project_storage)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [locations, projectId]
  );

  // Storage location IDs set for fast lookup
  const storageLocationIds = useMemo(() =>
    new Set(storageLocations.map(l => l.id)),
    [storageLocations]
  );

  // PHYSICALLY STORED: inventory at project storage locations
  const storageInventory = useMemo(() => {
    const map = {};
    storageLocations.forEach(loc => {
      const items = inventoryItems.filter(i => i.location_id === loc.id && (i.quantity_on_hand || 0) > 0);
      map[loc.id] = {
        partCount: items.length,
        totalUnits: items.reduce((s, i) => s + (i.quantity_on_hand || 0), 0),
        totalReserved: items.reduce((s, i) => s + (i.quantity_reserved || 0), 0),
      };
    });
    return map;
  }, [storageLocations, inventoryItems]);

  // RESERVED ELSEWHERE: commitments for this project with reserved_from_stock > 0
  // that are NOT physically in a project storage location
  const reservedElsewhere = useMemo(() => {
    // Get all inventory items for parts committed to this project
    const committedPartIds = new Set(
      commitments.filter(c => (c.reserved_from_stock || 0) > 0).map(c => c.part_id)
    );
    // Find inventory items for those parts NOT in project storage
    const elsewhereItems = inventoryItems.filter(i =>
      committedPartIds.has(i.part_id) &&
      !storageLocationIds.has(i.location_id) &&
      (i.quantity_reserved || 0) > 0
    );
    const totalReserved = elsewhereItems.reduce((s, i) => s + (i.quantity_reserved || 0), 0);
    const partCount = new Set(elsewhereItems.map(i => i.part_id)).size;
    return { totalReserved, partCount };
  }, [commitments, inventoryItems, storageLocationIds]);

  const hasStorage = storageLocations.length > 0;

  const handleInitializeStorage = async () => {
    if (isInitializing) return; // prevent double-click
    setIsInitializing(true);
    try {
      const templates = getActiveProjectStorageTemplates();
      const response = await base44.functions.invoke('initializeProjectStorage', {
        project_id: projectId,
        project_name: projectName,
        templates: templates.map(t => ({
          key: t.key,
          label: t.label,
          type: t.type,
          sortOrder: t.sortOrder,
        })),
      });
      const data = response.data;
      if (data.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ['locations'] });
      if (data.created_count > 0) {
        toast.success(`Created ${data.created_count} storage location${data.created_count !== 1 ? 's' : ''}${data.existing_count > 0 ? ` (${data.existing_count} already existed)` : ''}`);
      } else {
        toast.info(`All ${data.existing_count} storage locations already exist`);
      }
    } catch (error) {
      toast.error('Failed to initialize storage: ' + error.message);
    } finally {
      setIsInitializing(false);
    }
  };

  // Deep link URL for a storage location
  const getLocationUrl = (locId) =>
    `/partstracker?tab=locations&location=${locId}`;

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <MapPin className="w-5 h-5 text-purple-400" />
              Project Storage
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              {hasStorage
                ? `${storageLocations.length} storage locations`
                : 'No project storage initialized'}
            </p>
          </div>
          <Button
            onClick={handleInitializeStorage}
            disabled={isInitializing}
            variant={hasStorage ? "outline" : "default"}
            className={hasStorage ? "border-gray-700 text-gray-400 gap-2" : "bg-purple-600 hover:bg-purple-700 gap-2"}
            size="sm"
          >
            {isInitializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {hasStorage ? 'Add Missing' : 'Initialize Storage'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {!hasStorage ? (
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No project storage has been set up yet.</p>
            <p className="text-gray-500 text-xs mt-1">Click "Initialize Storage" to create default storage locations for this project.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {storageLocations.map(loc => {
              const tc = getLocationTypeConfig(loc.location_type);
              const Icon = tc.icon;
              const inv = storageInventory[loc.id] || { partCount: 0, totalUnits: 0, totalReserved: 0 };
              const isEmpty = inv.partCount === 0;

              return (
                <a
                  key={loc.id}
                  href={getLocationUrl(loc.id)}
                  onClick={(e) => { e.preventDefault(); window.location.href = getLocationUrl(loc.id); }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors hover:border-purple-700/50",
                    isEmpty
                      ? "border-gray-800 bg-gray-900/20"
                      : "border-gray-700 bg-gray-900/40"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" style={{ color: loc.color || tc.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {loc.location_area.replace(`${projectName} — `, '').replace(`${projectName || 'Project'} — `, '')}
                    </div>
                    <div className="text-xs text-gray-500">{tc.label}</div>
                  </div>
                  {!isEmpty ? (
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <div className="text-center">
                        <div className="text-white font-medium">{inv.totalUnits}</div>
                        <div className="text-gray-500">here</div>
                      </div>
                      {inv.totalReserved > 0 && (
                        <div className="text-center">
                          <div className="text-orange-400 font-medium">{inv.totalReserved}</div>
                          <div className="text-gray-500">rsv</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-600">Empty</span>
                  )}
                </a>
              );
            })}
          </div>
        )}

        {/* Reserved Elsewhere Summary */}
        {hasStorage && reservedElsewhere.totalReserved > 0 && (
          <div className="mt-3 px-4 py-3 bg-orange-950/20 border border-orange-800/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-orange-300 font-medium">Reserved Elsewhere</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {reservedElsewhere.partCount} part{reservedElsewhere.partCount !== 1 ? 's' : ''} ({reservedElsewhere.totalReserved} units)
              reserved for this project but stored at other locations.
            </p>
          </div>
        )}

        {/* Disclaimer */}
        {hasStorage && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-gray-800/30 rounded-lg border border-gray-800">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">
              <strong className="text-gray-400">Physically here</strong> = inventory stored at these project locations.
              <strong className="text-gray-400 ml-1">Reserved elsewhere</strong> = allocated to this project but physically at another location.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}