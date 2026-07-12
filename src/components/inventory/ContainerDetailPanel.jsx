import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRightLeft, Printer, Package, MapPin, Plus, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContainerTypeConfig } from "./containerTypeConfig";
import LocationBreadcrumb from "./LocationBreadcrumb";
import StoragePartRow from "./StoragePartRow";
import { renderQRSVGString } from "./QRCodeSVG";

export default function ContainerDetailPanel({
  container, locations, inventoryItems, parts, projects, vendors,
  onClose, onMove, onReturnHome, onAddParts, onPartClick, onOpenGallery, partActions,
  getInventoryStats, getInventoryItemId,
}) {
  const tc = getContainerTypeConfig(container.container_type);
  const TypeIcon = tc.icon;
  const displayColor = container.color || tc.color;
  const location = locations.find(l => l.id === container.location_id);
  const homeLocation = container.home_location_id ? locations.find(l => l.id === container.home_location_id) : null;
  const isAwayFromHome = homeLocation && container.location_id !== container.home_location_id;
  const project = container.project_id ? projects.find(p => p.id === container.project_id) : null;

  // Parts inside this container
  const containedItems = inventoryItems.filter(i => i.container_id === container.id && (i.quantity_on_hand || 0) > 0);
  const containedPartIds = new Set(containedItems.map(i => i.part_id));
  const containedParts = parts.filter(p => containedPartIds.has(p.id));

  const handlePrintQR = () => {
    let qrValue = container.qr_code_value;
    if (!qrValue) return;
    const qrSvg = renderQRSVGString(qrValue, 140);
    const html = `<!DOCTYPE html><html><head><title>Container Label</title><style>@page{size:4in 2in;margin:0.15in}body{font-family:Arial,sans-serif;margin:0;padding:8px}.label{display:flex;gap:12px;align-items:flex-start}.qr{flex-shrink:0}.info{flex:1}.name{font-size:18px;font-weight:bold;margin-bottom:4px}.type{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.code{font-size:24px;font-weight:bold;font-family:monospace;margin:6px 0}.loc{font-size:10px;color:#999;margin-top:4px}</style></head><body><div class="label"><div class="qr">${qrSvg}</div><div class="info"><div class="name">${container.name}</div><div class="type">Container · ${tc.label}</div>${container.short_code ? `<div class="code">${container.short_code}</div>` : ''}${location ? `<div class="loc">${location.location_area}</div>` : ''}</div></div></body></html>`;
    const w = window.open('', '_blank', 'width=500,height=300');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close(); }; }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-red-900/20 bg-gray-900/40 shrink-0">
        <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        {container.photo ? (
          <img src={container.photo} alt={container.name} className="w-10 h-10 rounded-lg object-cover border border-gray-700 shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: displayColor + '20' }}>
            <TypeIcon className="w-5 h-5" style={{ color: displayColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white truncate">{container.name}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: displayColor + '60', color: displayColor }}>{tc.label}</Badge>
            {container.short_code && <span className="font-mono">[{container.short_code}]</span>}
            {container.status === 'empty' && <Badge variant="outline" className="text-[10px] py-0 border-yellow-600 text-yellow-400">Empty</Badge>}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={handlePrintQR} className="h-8 w-8 text-gray-400 hover:text-white" title="Print QR Label">
          <Printer className="w-4 h-4" />
        </Button>
      </div>

      {/* Location, Home Location & Project */}
      <div className="px-4 py-3 border-b border-red-900/20 bg-gray-900/20 space-y-2">
        {/* Current Location */}
        <div className="flex items-center gap-2 text-xs">
          <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <span className="text-gray-500 shrink-0">At:</span>
          {location ? (
            <LocationBreadcrumb locationId={location.id} locations={locations} compact />
          ) : (
            <span className="text-yellow-400">No location assigned</span>
          )}
        </div>

        {/* Home Location */}
        {homeLocation && (
          <div className="flex items-center gap-2 text-xs">
            <Home className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="text-gray-500 shrink-0">Home:</span>
            <span className={cn("truncate", isAwayFromHome ? "text-amber-400" : "text-gray-300")}>{homeLocation.location_area}</span>
            {isAwayFromHome && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onReturnHome?.(container)}
                className="h-5 px-2 text-[10px] text-amber-400 hover:text-amber-300 gap-1 ml-auto shrink-0"
              >
                <Home className="w-3 h-3" /> Return Home
              </Button>
            )}
          </div>
        )}

        {/* Project */}
        {project && (
          <div className="flex items-center gap-2 text-xs">
            <Package className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-gray-300">{project.name}</span>
            {project.client_name && <span className="text-gray-500">({project.client_name})</span>}
          </div>
        )}

        {/* Description */}
        {container.description && (
          <p className="text-xs text-gray-500 italic">{container.description}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-500">Contents</span>
          <span className="text-white font-semibold">{containedParts.length} part{containedParts.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-500">{containedItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0)} units</span>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-red-900/20 bg-gray-900/10">
        {onAddParts && (
          <Button size="sm" variant="ghost" onClick={() => onAddParts(container)} className="gap-1 h-7 text-xs text-gray-400 hover:text-white">
            <Plus className="w-3.5 h-3.5" /> Add Parts
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onMove(container)} className="gap-1 h-7 text-xs border-gray-700 text-gray-300">
          <ArrowRightLeft className="w-3.5 h-3.5" /> Move
        </Button>
        {isAwayFromHome && (
          <Button size="sm" variant="outline" onClick={() => onReturnHome?.(container)} className="gap-1 h-7 text-xs border-amber-700/50 text-amber-400 hover:bg-amber-950/30">
            <Home className="w-3.5 h-3.5" /> Return Home
          </Button>
        )}
      </div>

      {/* Contents */}
      <div className="flex-1 overflow-y-auto p-4">
        {containedParts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Package className="w-12 h-12 text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">Container is empty</p>
            <p className="text-xs text-gray-600 mt-1">Add parts to this container from the location view</p>
          </div>
        ) : (
          <div className="space-y-2">
            {containedParts.map(part => {
              const item = containedItems.find(i => i.part_id === part.id);
              return (
                <StoragePartRow
                  key={part.id}
                  part={part}
                  locationQty={item?.quantity_on_hand || 0}
                  locationReserved={item?.quantity_reserved || 0}
                  locationId={container.location_id}
                  selectedLocationId={container.location_id}
                  getInventoryStats={getInventoryStats}
                  getInventoryItemId={getInventoryItemId}
                  vendors={vendors}
                  onPartClick={onPartClick}
                  onOpenGallery={onOpenGallery}
                  partActions={partActions}
                  containerName={container.name}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}