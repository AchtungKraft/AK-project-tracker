import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, MapPin, Package, ChevronRight, Image as ImageIcon, Clock, ArrowDownToLine, Printer, Star, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLocationTypeConfig } from "./locationTypeConfig";
import LocationBreadcrumb from "./LocationBreadcrumb";
import ImageGallery from "../parts/ImageGallery";
import LocationActivitySummary from "./LocationActivitySummary";

/**
 * LocationDetailPanel — shows detail for a selected location in the right pane.
 * Reads from already-loaded data (locations, inventoryItems, projects).
 * No additional queries.
 */
export default function LocationDetailPanel({
  locationId,
  locations,
  inventoryItems,
  parts,
  projects,
  commitments,
  onNavigateLocation,
  onEditLocation,
  onPrintQR,
  isFavorite,
  onToggleFavorite,
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const location = locations.find(l => l.id === locationId);

  // Direct inventory at this location
  const directItems = useMemo(() =>
    location ? inventoryItems.filter(i => i.location_id === locationId && (i.quantity_on_hand || 0) > 0) : [],
    [inventoryItems, locationId, location]
  );

  // Project context from commitments
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

  if (!location) return null;

  const tc = getLocationTypeConfig(location.location_type);
  const TypeIcon = tc.icon;
  const primaryPhoto = location.photos?.[0];
  const photos = location.photos || [];

  // Direct children
  const children = locations
    .filter(l => l.parent_id === locationId && l.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const totalUnits = directItems.reduce((s, i) => s + (i.quantity_on_hand || 0), 0);
  const totalReserved = directItems.reduce((s, i) => s + (i.quantity_reserved || 0), 0);
  const assignedProjects = (projects || []).filter(p => projectIds.has(p.id));

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        {primaryPhoto ? (
          <img
            src={primaryPhoto}
            alt={location.location_area}
            className="w-16 h-16 rounded-lg object-cover border border-gray-700 cursor-pointer shrink-0"
            loading="lazy"
            onClick={() => { setGalleryIndex(0); setGalleryOpen(true); }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
            <TypeIcon className="w-8 h-8" style={{ color: location.color || tc.color }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white truncate">{location.location_area}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs" style={{ borderColor: tc.color + '80', color: tc.color }}>
              <TypeIcon className="w-3 h-3 mr-1" />
              {tc.label}
            </Badge>
            {location.short_code && (
              <span className="text-xs font-mono text-gray-400">[{location.short_code}]</span>
            )}
            {!location.active && (
              <Badge variant="outline" className="text-xs border-gray-600 text-gray-500">Inactive</Badge>
            )}
          </div>
          <div className="mt-1">
            <LocationBreadcrumb
              locationId={locationId}
              locations={locations}
              onNavigate={onNavigateLocation}
              compact
            />
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {onToggleFavorite && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onToggleFavorite(locationId)}
              className={cn("h-8 w-8", isFavorite ? "text-yellow-500" : "text-gray-500")}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={cn("w-4 h-4", isFavorite && "fill-yellow-500")} />
            </Button>
          )}
          {onEditLocation && (
            <Button size="icon" variant="ghost" onClick={() => onEditLocation(locationId)} className="h-8 w-8 text-blue-400">
              <Edit2 className="w-4 h-4" />
            </Button>
          )}
          {onPrintQR && (
            <Button size="icon" variant="ghost" onClick={() => onPrintQR(location)} className="h-8 w-8 text-gray-400">
              <Printer className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Description & Notes */}
      {(location.description || location.notes || location.bin_description) && (
        <div className="space-y-1 text-sm">
          {location.description && <p className="text-gray-300">{location.description}</p>}
          {location.bin_description && <p className="text-gray-400">Bin: {location.bin_description}</p>}
          {location.notes && <p className="text-gray-500 italic">{location.notes}</p>}
        </div>
      )}

      {/* Photo gallery */}
      {photos.length > 1 ? (
        <div className="flex gap-2 flex-wrap">
          {photos.map((p, idx) => (
            <img
              key={idx}
              src={p}
              alt={`Photo ${idx + 1}`}
              className="w-14 h-14 rounded border border-gray-700 object-cover cursor-pointer hover:border-red-500 transition-colors"
              loading="lazy"
              onClick={() => { setGalleryIndex(idx); setGalleryOpen(true); }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ))}
        </div>
      ) : photos.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/30 rounded-lg border border-dashed border-gray-700 text-xs text-gray-500">
          <Camera className="w-4 h-4" />
          No photo yet — add one in Admin Config
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-white">{directItems.length}</div>
          <div className="text-xs text-gray-500">Parts</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-white">{totalUnits}</div>
          <div className="text-xs text-gray-500">Stored Here</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className={cn("text-lg font-bold", totalReserved > 0 ? "text-orange-400" : "text-gray-500")}>{totalReserved}</div>
          <div className="text-xs text-gray-500">Reserved</div>
        </div>
      </div>

      {/* Child Locations */}
      {children.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Inside ({children.length})</h4>
          <div className="space-y-1">
            {children.map(child => {
              const ctc = getLocationTypeConfig(child.location_type);
              const CIcon = ctc.icon;
              const childCount = inventoryItems.filter(i => i.location_id === child.id && (i.quantity_on_hand || 0) > 0).length;
              return (
                <button
                  key={child.id}
                  onClick={() => onNavigateLocation?.(child.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800/30 rounded-lg hover:bg-gray-800/60 transition-colors text-left"
                >
                  <CIcon className="w-4 h-4 shrink-0" style={{ color: child.color || ctc.color }} />
                  <span className="text-sm text-gray-300 flex-1 truncate">{child.location_area}</span>
                  {child.short_code && <span className="text-[10px] font-mono text-gray-500">[{child.short_code}]</span>}
                  {childCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-300">{childCount}</span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Assigned Projects */}
      {assignedProjects.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Projects ({assignedProjects.length})</h4>
          <div className="space-y-1">
            {assignedProjects.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/30 rounded text-sm">
                <Package className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-gray-300 truncate">{p.name}</span>
                {p.client_name && <span className="text-gray-500 text-xs">({p.client_name})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <LocationActivitySummary locationId={locationId} parts={parts || []} />

      {/* QR Info */}
      {location.qr_code_value && (
        <div className="text-xs text-gray-500 font-mono bg-gray-800/30 rounded px-3 py-2">
          QR: {location.qr_code_value}
        </div>
      )}

      <ImageGallery
        isOpen={galleryOpen}
        images={photos}
        currentIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
        onNavigate={(d) => {
          if (typeof d === 'number') setGalleryIndex(d);
          else if (d === 'next') setGalleryIndex(i => Math.min(i + 1, photos.length - 1));
          else setGalleryIndex(i => Math.max(i - 1, 0));
        }}
      />
    </div>
  );
}