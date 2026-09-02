import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Package, Box, RefreshCw, Search, AlertTriangle,
  ChevronRight, FolderOpen, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildBreadcrumb } from "@/lib/resolveStorageScan";
import { getLocationTypeConfig } from "./locationTypeConfig";
import { getContainerTypeConfig } from "./containerTypeConfig";

/**
 * ScanResultPanel — displays the result of a resolved QR scan.
 * Shows entity identity + summary stats, then offers navigation actions.
 *
 * Props:
 *   scanResult     — output from resolveStorageScan()
 *   locations      — all Location records
 *   containers     — all StorageContainer records
 *   inventoryItems — all InventoryItem records
 *   projects       — all Project records
 *   onOpenEntity() — navigate into the canonical detail view
 *   onScanAgain()  — re-open scanner
 *   onBrowse()     — fallback: browse storage manually
 */
export default function ScanResultPanel({
  scanResult,
  locations = [],
  containers = [],
  inventoryItems = [],
  projects = [],
  onOpenEntity,
  onScanAgain,
  onBrowse,
}) {
  if (!scanResult) return null;

  // ── INVALID / ERROR ──
  if (!scanResult.valid) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-950/50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-white text-lg font-bold mb-1">
          {scanResult.entity_type === 'LOCATION' && 'Location Not Found'}
          {scanResult.entity_type === 'CONTAINER' && 'Container Not Found'}
          {!scanResult.entity_type && 'QR Not Recognized'}
        </p>
        <p className="text-gray-400 text-sm mb-1">{scanResult.error}</p>
        <p className="text-gray-600 text-xs font-mono mb-6 break-all max-w-xs">{scanResult.raw}</p>
        <div className="flex gap-3">
          <Button onClick={onScanAgain} className="gap-2 bg-red-600 hover:bg-red-700 h-11">
            <RefreshCw className="w-4 h-4" /> Scan Again
          </Button>
          <Button onClick={onBrowse} variant="outline" className="gap-2 border-gray-600 text-gray-300 h-11">
            <Search className="w-4 h-4" /> Browse Storage
          </Button>
        </div>
      </div>
    );
  }

  // ── LOCATION RESULT ──
  if (scanResult.entity_type === 'LOCATION') {
    return (
      <LocationScanResult
        location={scanResult.entity}
        locations={locations}
        containers={containers}
        inventoryItems={inventoryItems}
        projects={projects}
        onOpen={() => onOpenEntity?.('LOCATION', scanResult.entity_id)}
        onScanAgain={onScanAgain}
      />
    );
  }

  // ── CONTAINER RESULT ──
  if (scanResult.entity_type === 'CONTAINER') {
    return (
      <ContainerScanResult
        container={scanResult.entity}
        locations={locations}
        inventoryItems={inventoryItems}
        projects={projects}
        onOpen={() => onOpenEntity?.('CONTAINER', scanResult.entity_id)}
        onScanAgain={onScanAgain}
      />
    );
  }

  return null;
}

// ════════════════════════════════════════════
// LOCATION SCAN RESULT
// ════════════════════════════════════════════
function LocationScanResult({ location, locations, containers, inventoryItems, projects, onOpen, onScanAgain }) {
  const tc = getLocationTypeConfig(location.location_type);
  const TypeIcon = tc.icon;
  const breadcrumb = buildBreadcrumb(location.id, locations);

  const children = locations.filter(l => l.parent_id === location.id && l.active !== false);
  const containersHere = containers.filter(c => c.location_id === location.id && c.active !== false);
  const directItems = inventoryItems.filter(i => i.location_id === location.id && (i.quantity_on_hand || 0) > 0);
  const totalQty = directItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
  const project = location.project_id ? projects.find(p => p.id === location.project_id) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Success header */}
      <div className="bg-green-950/30 border-b border-green-900/30 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 text-green-400 text-xs font-semibold uppercase tracking-wide">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Location Found
        </div>
      </div>

      {/* Identity */}
      <div className="px-4 py-4 space-y-3 flex-1 overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: (location.color || tc.color) + '20' }}>
            <TypeIcon className="w-6 h-6" style={{ color: location.color || tc.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white">{location.location_area}</h3>
            {location.short_code && (
              <span className="text-sm font-mono font-bold text-gray-300">{location.short_code}</span>
            )}
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{breadcrumb}</span>
        </div>

        {/* Type badge + project */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: tc.color + '60', color: tc.color }}>
            {tc.label}
          </Badge>
          {project && (
            <Badge variant="outline" className="text-[10px] py-0 border-blue-600/40 text-blue-400 gap-1">
              <Package className="w-3 h-3" /> {project.name}
            </Badge>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Child Locations" value={children.length} icon={MapPin} color="text-purple-400" />
          <StatCard label="Containers" value={containersHere.length} icon={Box} color="text-indigo-400" />
          <StatCard label="Direct Parts" value={directItems.length} icon={Package} color="text-blue-400" />
          <StatCard label="Total Qty" value={totalQty} icon={Package} color="text-green-400" />
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-4 border-t border-gray-800 shrink-0 space-y-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <Button onClick={onOpen} className="w-full h-12 text-base gap-2 bg-red-600 hover:bg-red-700">
          <FolderOpen className="w-5 h-5" /> Open Location
        </Button>
        <Button onClick={onScanAgain} variant="outline" className="w-full h-12 text-base border-gray-600 text-gray-300 gap-2">
          <RefreshCw className="w-5 h-5" /> Scan Again
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// CONTAINER SCAN RESULT
// ════════════════════════════════════════════
function ContainerScanResult({ container, locations, inventoryItems, projects, onOpen, onScanAgain }) {
  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;

  const location = locations.find(l => l.id === container.location_id);
  const breadcrumb = container.location_id ? buildBreadcrumb(container.location_id, locations) : 'No location';
  const project = container.project_id ? projects.find(p => p.id === container.project_id) : null;

  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);
  const totalQty = containedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Success header */}
      <div className="bg-green-950/30 border-b border-green-900/30 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 text-green-400 text-xs font-semibold uppercase tracking-wide">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Container Found
        </div>
      </div>

      {/* Identity */}
      <div className="px-4 py-4 space-y-3 flex-1 overflow-y-auto">
        <div className="flex items-start gap-3">
          {container.photo ? (
            <img src={container.photo} alt={container.name}
              className="w-12 h-12 rounded-lg object-cover border border-gray-700 shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: displayColor + '20' }}>
              <TypeIcon className="w-6 h-6" style={{ color: displayColor }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white">{container.name}</h3>
            {container.short_code && (
              <span className="text-sm font-mono font-bold text-gray-300">{container.short_code}</span>
            )}
          </div>
        </div>

        {/* Current location breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{breadcrumb}</span>
        </div>

        {/* Type badge + project */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: displayColor + '60', color: displayColor }}>
            {tc.label}
          </Badge>
          {project && (
            <Badge variant="outline" className="text-[10px] py-0 border-blue-600/40 text-blue-400 gap-1">
              <Package className="w-3 h-3" /> {project.name}
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Inventory Lines" value={containedItems.length} icon={Package} color="text-blue-400" />
          <StatCard label="Total Qty" value={totalQty} icon={Package} color="text-green-400" />
        </div>

        {/* Notes callout */}
        {container.notes && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-950/20 border border-yellow-900/20 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
            <span className="text-yellow-300">{container.notes}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-4 border-t border-gray-800 shrink-0 space-y-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <Button onClick={onOpen} className="w-full h-12 text-base gap-2 bg-red-600 hover:bg-red-700">
          <FolderOpen className="w-5 h-5" /> Open Container
        </Button>
        <Button onClick={onScanAgain} variant="outline" className="w-full h-12 text-base border-gray-600 text-gray-300 gap-2">
          <RefreshCw className="w-5 h-5" /> Scan Again
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// Small stat card
// ════════════════════════════════════════════
function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="p-2.5 bg-gray-900/50 rounded-lg border border-gray-800">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={cn("w-3 h-3", color)} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-lg font-bold text-white">{value}</span>
    </div>
  );
}