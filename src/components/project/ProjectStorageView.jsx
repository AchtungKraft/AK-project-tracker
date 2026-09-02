import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Package, Plus, Loader2, Box, ArrowRightLeft,
  Undo2, AlertTriangle, ChevronDown, ChevronRight, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { resolveProjectInventory } from "@/lib/projectStorageResolver";
import { getLocationTypeConfig } from "@/components/inventory/locationTypeConfig";
import { getActiveProjectStorageTemplates } from "@/components/admin/ProjectStorageTemplatesConfig";
import LocationBreadcrumb from "@/components/inventory/LocationBreadcrumb";
import ProjectStorageInventoryList from "./ProjectStorageInventoryList";
import ProjectStorageRecentMoves from "./ProjectStorageRecentMoves";
import CreateProjectLocationModal from "./CreateProjectLocationModal";
import CreateContainerModal from "@/components/inventory/CreateContainerModal";
import ProjectStagingWorkflow from "./ProjectStagingWorkflow";

const REF = { staleTime: 60000, refetchOnWindowFocus: false };
const FAST = { staleTime: 15000, refetchOnWindowFocus: false };

export default function ProjectStorageView({ projectId, projectName }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [activeSection, setActiveSection] = useState('inventory'); // inventory | locations | history
  const [isInitializing, setIsInitializing] = useState(false);
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [showCreateContainer, setShowCreateContainer] = useState(false);
  const [stagingMode, setStagingMode] = useState(null); // null | 'stage' | 'return'

  // Data
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => base44.entities.Location.list(), ...REF });
  const { data: containers = [] } = useQuery({ queryKey: ['storageContainers'], queryFn: () => base44.entities.StorageContainer.filter({ active: true }), ...REF });
  const { data: inventoryItems = [] } = useQuery({ queryKey: ['inventoryItems'], queryFn: () => base44.entities.InventoryItem.list(), ...FAST });
  const { data: parts = [] } = useQuery({ queryKey: ['parts'], queryFn: () => base44.entities.Part.list(), ...REF });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list(), ...REF });
  const { data: commitments = [] } = useQuery({
    queryKey: ['projectCommitments', projectId],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: projectId, commitment_status: { $nin: ['cancelled', 'closed'] } }),
    ...FAST, enabled: !!projectId,
  });

  // Resolve project inventory
  const { items: projectItems, summary, projectLocations, projectContainers } = useMemo(() =>
    resolveProjectInventory(projectId, { locations, containers, inventoryItems, parts, commitments }),
    [projectId, locations, containers, inventoryItems, parts, commitments]
  );

  const hasStorage = projectLocations.length > 0 || projectContainers.length > 0;

  // Initialize storage from templates
  const handleInitialize = async () => {
    if (isInitializing) return;
    setIsInitializing(true);
    try {
      const templates = getActiveProjectStorageTemplates();
      const res = await base44.functions.invoke('initializeProjectStorage', {
        project_id: projectId, project_name: projectName,
        templates: templates.map(t => ({ key: t.key, label: t.label, type: t.type, sortOrder: t.sortOrder })),
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      if (data.created_count > 0) {
        toast({ title: `Created ${data.created_count} storage location${data.created_count !== 1 ? 's' : ''}` });
      } else {
        toast({ title: `All locations already exist` });
      }
    } catch (e) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setIsInitializing(false); }
  };

  const navigateToLocation = (locId) =>
    navigate(`/partstracker?tab=locations&location=${locId}`);

  return (
    <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
      <CardHeader className="border-b border-red-900/30 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <MapPin className="w-5 h-5 text-purple-400" />
              Project Storage
            </CardTitle>
            {hasStorage && (
              <p className="text-xs text-gray-400 mt-1">
                {summary.locationCount} locations · {summary.containerCount} containers · {summary.totalQty} units staged
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasStorage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setStagingMode('stage')}
                  className="gap-1.5 border-green-800/50 text-green-400 hover:bg-green-950/30 h-8 text-xs">
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Stage Parts
                </Button>
                {projectItems.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setStagingMode('return')}
                    className="gap-1.5 border-amber-800/50 text-amber-400 hover:bg-amber-950/30 h-8 text-xs">
                    <Undo2 className="w-3.5 h-3.5" /> Return to Stock
                  </Button>
                )}
              </>
            )}
            <Button size="sm" variant={hasStorage ? "outline" : "default"} onClick={handleInitialize}
              disabled={isInitializing}
              className={cn("gap-1.5 h-8 text-xs", !hasStorage && "bg-purple-600 hover:bg-purple-700")}
            >
              {isInitializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {hasStorage ? 'Add Templates' : 'Initialize Storage'}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Summary bar */}
      {hasStorage && (
        <div className={cn("flex gap-4 px-4 py-3 border-b border-gray-800", isMobile ? "flex-wrap gap-3" : "")}>
          {[
            { label: 'Locations', value: summary.locationCount, icon: MapPin, color: 'text-purple-400' },
            { label: 'Containers', value: summary.containerCount, icon: Box, color: 'text-indigo-400' },
            { label: 'Parts', value: summary.uniqueParts, icon: Package, color: 'text-blue-400' },
            { label: 'Units Staged', value: summary.totalQty, icon: ArrowRightLeft, color: 'text-green-400' },
            ...(summary.totalReserved > 0 ? [{ label: 'Reserved', value: summary.totalReserved, icon: Package, color: 'text-orange-400' }] : []),
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <s.icon className={cn("w-3.5 h-3.5 shrink-0", s.color)} />
              <span className="text-gray-500">{s.label}</span>
              <span className="text-white font-bold">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      <CardContent className="p-4">
        {!hasStorage ? (
          <div className="text-center py-10">
            <Package className="w-14 h-14 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No project storage set up yet.</p>
            <p className="text-gray-600 text-xs mt-1">Initialize from templates or create locations manually.</p>
            <div className="flex justify-center gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => setShowCreateLocation(true)} className="gap-1.5 text-xs">
                <MapPin className="w-3.5 h-3.5" /> Create Location
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateContainer(true)} className="gap-1.5 text-xs">
                <Box className="w-3.5 h-3.5" /> Create Container
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Section tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-gray-800 pb-2">
              {[
                { key: 'inventory', label: 'Inventory', icon: Package },
                { key: 'locations', label: 'Locations & Containers', icon: MapPin },
                { key: 'history', label: 'Recent Moves', icon: Clock },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveSection(tab.key)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors",
                    activeSection === tab.key ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300")}>
                  <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setShowCreateLocation(true)}
                className="h-7 px-2 text-[10px] text-gray-500 gap-1">
                <MapPin className="w-3 h-3" /> + Location
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreateContainer(true)}
                className="h-7 px-2 text-[10px] text-gray-500 gap-1">
                <Box className="w-3 h-3" /> + Container
              </Button>
            </div>

            {/* Inventory */}
            {activeSection === 'inventory' && (
              <ProjectStorageInventoryList
                items={projectItems}
                locations={locations}
                commitments={commitments}
                onNavigate={navigateToLocation}
              />
            )}

            {/* Locations & Containers */}
            {activeSection === 'locations' && (
              <div className="space-y-2">
                {projectLocations.map(loc => {
                  const tc = getLocationTypeConfig(loc.location_type);
                  const Icon = tc.icon;
                  const locItems = inventoryItems.filter(i => i.location_id === loc.id && (i.quantity_on_hand || 0) > 0);
                  const locCtrs = containers.filter(c => c.location_id === loc.id && c.project_id === projectId && c.active !== false);
                  const totalQty = locItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
                  return (
                    <button key={loc.id} onClick={() => navigateToLocation(loc.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-800 hover:border-purple-700/50 transition-colors text-left">
                      <Icon className="w-5 h-5 shrink-0" style={{ color: loc.color || tc.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{loc.location_area}</div>
                        <LocationBreadcrumb locationId={loc.id} locations={locations} compact />
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        {locCtrs.length > 0 && <span className="text-purple-400">{locCtrs.length} ctr</span>}
                        <span className="text-white font-bold">{totalQty}</span>
                        <span className="text-gray-500">units</span>
                      </div>
                    </button>
                  );
                })}
                {projectContainers.filter(c => !projectLocations.some(l => l.id === c.location_id)).length > 0 && (
                  <>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-3 mb-1">Containers at other locations</div>
                    {projectContainers
                      .filter(c => !projectLocations.some(l => l.id === c.location_id))
                      .map(c => {
                        const cItems = inventoryItems.filter(i => i.container_id === c.id && (i.quantity_on_hand || 0) > 0);
                        const loc = locations.find(l => l.id === c.location_id);
                        return (
                          <button key={c.id} onClick={() => loc && navigateToLocation(loc.id)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-800 hover:border-indigo-700/50 transition-colors text-left">
                            <Box className="w-4 h-4 text-indigo-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-white">{c.name}</span>
                              {c.short_code && <span className="text-xs text-gray-400 font-mono ml-2">{c.short_code}</span>}
                              <div className="text-xs text-gray-500 truncate">{loc?.location_area || 'No location'}</div>
                            </div>
                            <span className="text-white font-bold text-xs">{cItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0)}</span>
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            )}

            {/* History */}
            {activeSection === 'history' && (
              <ProjectStorageRecentMoves
                projectId={projectId}
                locations={locations}
                containers={containers}
                parts={parts}
              />
            )}
          </>
        )}
      </CardContent>

      {/* Modals */}
      {showCreateLocation && (
        <CreateProjectLocationModal
          onClose={(created) => {
            setShowCreateLocation(false);
            if (created?.id) queryClient.invalidateQueries({ queryKey: ['locations'] });
          }}
          projectId={projectId}
          projectName={projectName}
          locations={locations}
        />
      )}
      {showCreateContainer && (
        <CreateContainerModal
          onClose={() => {
            setShowCreateContainer(false);
            queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
          }}
          preselectedProjectId={projectId}
          locations={locations}
          projects={projects}
        />
      )}
      {stagingMode && (
        <ProjectStagingWorkflow
          mode={stagingMode}
          projectId={projectId}
          projectName={projectName}
          projectItems={projectItems}
          locations={locations}
          containers={containers}
          inventoryItems={inventoryItems}
          parts={parts}
          projects={projects}
          onClose={() => {
            setStagingMode(null);
            queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
          }}
        />
      )}
    </Card>
  );
}