import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Plus, Loader2, MapPin, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getLocationTypeConfig, PROJECT_STORAGE_TEMPLATES } from "@/components/inventory/locationTypeConfig";
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

  // Project storage locations
  const storageLocations = useMemo(() =>
    locations
      .filter(l => l.project_id === projectId && l.is_project_storage)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [locations, projectId]
  );

  // Inventory per storage location
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

  const hasStorage = storageLocations.length > 0;

  const handleInitializeStorage = async () => {
    setIsInitializing(true);
    try {
      // Idempotent: check existing template_keys for this project
      const existingKeys = new Set(storageLocations.map(l => l.template_key).filter(Boolean));
      const toCreate = PROJECT_STORAGE_TEMPLATES.filter(t => !existingKeys.has(t.key));

      if (toCreate.length === 0) {
        toast.info('Project storage is already initialized');
        setIsInitializing(false);
        return;
      }

      const creates = toCreate.map(t =>
        base44.entities.Location.create({
          location_area: `${projectName || 'Project'} — ${t.label}`,
          location_type: t.type,
          template_key: t.key,
          project_id: projectId,
          is_project_storage: true,
          sort_order: t.sortOrder,
          active: true,
          color: getLocationTypeConfig(t.type).color,
        })
      );

      await Promise.all(creates);
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success(`Created ${toCreate.length} storage location${toCreate.length !== 1 ? 's' : ''}`);
    } catch (error) {
      toast.error('Failed to initialize storage: ' + error.message);
    } finally {
      setIsInitializing(false);
    }
  };

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
          {!hasStorage && (
            <Button
              onClick={handleInitializeStorage}
              disabled={isInitializing}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
              size="sm"
            >
              {isInitializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Initialize Storage
            </Button>
          )}
          {hasStorage && (
            <Button
              onClick={handleInitializeStorage}
              disabled={isInitializing}
              variant="outline"
              className="border-gray-700 text-gray-400 gap-2"
              size="sm"
            >
              {isInitializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Missing
            </Button>
          )}
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
                <div
                  key={loc.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors",
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
                        <div className="text-white font-medium">{inv.partCount}</div>
                        <div className="text-gray-500">parts</div>
                      </div>
                      <div className="text-center">
                        <div className="text-white font-medium">{inv.totalUnits}</div>
                        <div className="text-gray-500">units</div>
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
                </div>
              );
            })}
          </div>
        )}

        {/* Disclaimer */}
        {hasStorage && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-gray-800/30 rounded-lg border border-gray-800">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">
              This panel shows inventory <strong className="text-gray-400">physically stored</strong> at project storage locations.
              Parts reserved for this project but stored elsewhere are not shown here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}