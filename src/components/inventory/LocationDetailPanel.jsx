import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Package, ChevronRight, ChevronDown, Printer, Star, Plus, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "./locationTypeConfig";
import LocationBreadcrumb from "./LocationBreadcrumb";
import ImageGallery from "../parts/ImageGallery";
import LocationActivitySummary from "./LocationActivitySummary";
import ContainerCard from "./ContainerCard";

export default function LocationDetailPanel({
  locationId,
  locations,
  inventoryItems,
  parts,
  projects,
  commitments,
  containers = [],
  onNavigateLocation,
  onPrintQR,
  isFavorite,
  onToggleFavorite,
  onSelectContainer,
  onMoveContainer,
  onCreateContainer,
  onMoveFromLocation,
  selectedContainerId,
  flashId,
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showMore, setShowMore] = useState(false);

  const location = locations.find(l => l.id === locationId);

  const directItems = useMemo(() =>
    location ? inventoryItems.filter(i => i.location_id === locationId && (i.quantity_on_hand || 0) > 0) : [],
    [inventoryItems, locationId, location]
  );

  const projectIds = useMemo(() => {
    const partIds = new Set(directItems.map(i => i.part_id));
    const pIds = new Set();
    (commitments || []).forEach(c => {
      if (partIds.has(c.part_id) && (c.reserved_from_stock || 0) > 0) {
        pIds.add(c.project_id);
      }
    });
    return pIds;
  }, [directItems, commitments]);

  const containersHere = useMemo(() =>
    containers.filter(c => c.location_id === locationId && c.active !== false),
    [containers, locationId]
  );

  const children = useMemo(() =>
    locations
      .filter(l => l.parent_id === locationId && l.active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [locations, locationId]
  );

  if (!location) return null;

  const tc = getLocationTypeConfig(location.location_type);
  const TypeIcon = tc.icon;
  const primaryPhoto = location.photos?.[0];
  const photos = location.photos || [];

  const totalUnits = directItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
  const assignedProjects = (projects || []).filter(p => projectIds.has(p.id));
  const hasMoreInfo = location.description || location.notes || location.bin_description || assignedProjects.length > 0 || photos.length > 1 || location.qr_code_value;

  return (
    <div className="space-y-3 p-4">
      {/* Header — identity + primary actions */}
      <div className="flex items-start gap-3">
        {primaryPhoto ? (
          <img
            src={primaryPhoto}
            alt={location.location_area}
            className="w-14 h-14 rounded-lg object-cover border border-gray-700 cursor-pointer shrink-0"
            loading="lazy"
            onClick={() => { setGalleryIndex(0); setGalleryOpen(true); }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
            <TypeIcon className="w-7 h-7" style={{ color: location.color || tc.color }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white truncate">{location.location_area}</h3>
          <LocationBreadcrumb locationId={locationId} locations={locations} onNavigate={onNavigateLocation} compact />
        </div>
        {/* Primary actions — always visible */}
        <div className="flex gap-1 shrink-0">
          {onToggleFavorite && (
            <Button size="icon" variant="ghost" onClick={() => onToggleFavorite(locationId)}
              className={cn("h-8 w-8", isFavorite ? "text-yellow-500" : "text-gray-500")}>
              <Star className={cn("w-4 h-4", isFavorite && "fill-yellow-500")} />
            </Button>
          )}
          {onPrintQR && (
            <Button size="icon" variant="ghost" onClick={() => onPrintQR(location)} className="h-8 w-8 text-gray-400" title="Print Label">
              <Printer className="w-4 h-4" />
            </Button>
          )}
          {onMoveFromLocation && directItems.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onMoveFromLocation(locationId)} className="h-8 px-2 text-xs text-gray-400 hover:text-white gap-1" title="Move loose inventory">
              <ArrowRightLeft className="w-3.5 h-3.5" /> Move
            </Button>
          )}
          {onCreateContainer && (
            <Button size="sm" variant="ghost" onClick={() => onCreateContainer(locationId)} className="h-8 px-2 text-xs text-gray-400 hover:text-white gap-1">
              <Plus className="w-3.5 h-3.5" /> Container
            </Button>
          )}
        </div>
      </div>

      {/* Quick stats — minimal */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span><span className="text-white font-semibold">{directItems.length}</span> parts</span>
        <span><span className="text-white font-semibold">{totalUnits}</span> units</span>
        {children.length > 0 && <span><span className="text-white font-semibold">{children.length}</span> sub-locations</span>}
        {containersHere.length > 0 && <span><span className="text-white font-semibold">{containersHere.length}</span> containers</span>}
      </div>

      {/* Sub-locations — compact pills */}
      {children.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {children.map(child => {
            const ctc = getLocationTypeConfig(child.location_type);
            const CIcon = ctc.icon;
            const childCount = inventoryItems.filter(i => i.location_id === child.id && (i.quantity_on_hand || 0) > 0).length;
            return (
              <button key={child.id} onClick={() => onNavigateLocation?.(child.id)}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/40 rounded-md hover:bg-gray-800/70 transition-colors text-left">
                <CIcon className="w-3.5 h-3.5 shrink-0" style={{ color: child.color || ctc.color }} />
                <span className="text-xs text-gray-300 truncate max-w-[120px]">{child.location_area}</span>
                {childCount > 0 && <span className="text-[10px] px-1 py-0 rounded-full bg-gray-700 text-gray-300">{childCount}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Containers — clearly separated section */}
      {containersHere.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Containers</div>
          <div className="space-y-1">
            {containersHere.map(c => {
              const itemCount = inventoryItems.filter(i => i.container_id === c.id && (i.quantity_on_hand || 0) > 0).length;
              const proj = c.project_id ? projects.find(p => p.id === c.project_id) : null;
              const homeLoc = c.home_location_id ? locations.find(l => l.id === c.home_location_id) : null;
              return (
                <ContainerCard key={c.id} container={c} itemCount={itemCount} location={location}
                  homeLocation={homeLoc} project={proj} locations={locations}
                  onMove={onMoveContainer} onReturnHome={(ctr) => onMoveContainer?.(ctr)}
                  onSelect={onSelectContainer} compact
                  isSelected={selectedContainerId === c.id}
                  isFlashing={flashId === c.id} />
              );
            })}
          </div>
        </div>
      )}

      {/* Progressive disclosure — everything else */}
      {hasMoreInfo && (
        <button onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wide">
          {showMore ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          More
        </button>
      )}

      {showMore && (
        <div className="space-y-3 pl-1 border-l-2 border-gray-800 ml-1">
          {(location.description || location.bin_description || location.notes) && (
            <div className="space-y-1 text-xs pl-3">
              {location.description && <p className="text-gray-300">{location.description}</p>}
              {location.bin_description && <p className="text-gray-400">Bin: {location.bin_description}</p>}
              {location.notes && <p className="text-gray-500 italic">{location.notes}</p>}
            </div>
          )}
          {photos.length > 1 && (
            <div className="flex gap-1.5 flex-wrap pl-3">
              {photos.map((p, idx) => (
                <img key={idx} src={p} alt={`Photo ${idx + 1}`}
                  className="w-12 h-12 rounded border border-gray-700 object-cover cursor-pointer hover:border-red-500 transition-colors"
                  loading="lazy" onClick={() => { setGalleryIndex(idx); setGalleryOpen(true); }}
                  onError={(e) => { e.target.style.display = 'none'; }} />
              ))}
            </div>
          )}
          {assignedProjects.length > 0 && (
            <div className="pl-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Projects</div>
              <div className="space-y-0.5">
                {assignedProjects.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <Package className="w-3 h-3 text-blue-400" />
                    <span className="text-gray-300 truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="pl-3">
            <LocationActivitySummary locationId={locationId} parts={parts || []} />
          </div>
          {location.qr_code_value && (
            <div className="text-[10px] text-gray-500 font-mono bg-gray-800/30 rounded px-3 py-1.5 ml-3">
              QR: {location.qr_code_value}
            </div>
          )}
          <div className="pl-3">
            <Badge variant="outline" className="text-[9px] py-0" style={{ borderColor: tc.color + '80', color: tc.color }}>
              {tc.label}
            </Badge>
            {location.short_code && (
              <span className="text-[10px] font-mono text-gray-500 ml-2">[{location.short_code}]</span>
            )}
          </div>
        </div>
      )}

      <ImageGallery isOpen={galleryOpen} images={photos} currentIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
        onNavigate={(d) => {
          if (typeof d === 'number') setGalleryIndex(d);
          else if (d === 'next') setGalleryIndex(i => Math.min(i + 1, photos.length - 1));
          else setGalleryIndex(i => Math.max(i - 1, 0));
        }} />
    </div>
  );
}