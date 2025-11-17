import React from "react";
import { ChevronRight, ChevronDown, MapPin, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LocationTree({
  locations,
  parts,
  selectedLocation,
  expandedLocations,
  onLocationSelect,
  onToggleExpand,
  searchTerm,
}) {
  // Calculate part count for a location and its descendants
  const getLocationPartCount = (locationId) => {
    const getDescendants = (locId) => {
      const descendants = [locId];
      locations
        .filter(loc => loc.parent_id === locId)
        .forEach(child => {
          descendants.push(...getDescendants(child.id));
        });
      return descendants;
    };

    const locationIds = getDescendants(locationId);
    return parts.filter(p => p.location_id && locationIds.includes(p.location_id)).length;
  };

  // Filter locations based on search
  const matchesSearch = (location) => {
    if (!searchTerm) return true;
    return location.location_area?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           location.bin_description?.toLowerCase().includes(searchTerm.toLowerCase());
  };

  // Render a single location node
  const renderLocation = (location, depth = 0) => {
    const children = locations.filter(loc => loc.parent_id === location.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedLocations.has(location.id);
    const isSelected = selectedLocation === location.id;
    const partCount = getLocationPartCount(location.id);
    const showNode = matchesSearch(location) || searchTerm === '';

    if (!showNode && !hasChildren) return null;

    return (
      <div key={location.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group",
            "hover:bg-red-950/20",
            isSelected && "bg-red-950/40 border-l-4",
            !isSelected && "border-l-4 border-transparent"
          )}
          style={{
            paddingLeft: `${depth * 16 + 12}px`,
            borderLeftColor: isSelected ? location.color : 'transparent',
          }}
          onClick={() => onLocationSelect(location.id)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(location.id);
              }}
              className="flex-shrink-0 hover:bg-gray-700/50 rounded p-0.5 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>
          )}
          
          {!hasChildren && <div className="w-5" />}

          <MapPin 
            className="w-4 h-4 flex-shrink-0" 
            style={{ color: location.color || '#8B5CF6' }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span 
                className={cn(
                  "text-sm font-medium truncate",
                  isSelected ? "text-white" : "text-gray-300"
                )}
              >
                {location.location_area}
              </span>
              {location.bin_description && (
                <span className="text-xs text-gray-500">
                  {location.bin_description}
                </span>
              )}
            </div>
            {location.storage_type && (
              <div className="text-xs text-gray-500 truncate">
                {location.storage_type}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {location.qr_code_value && (
              <div className="w-5 h-5 bg-gray-700 rounded flex items-center justify-center">
                <Package className="w-3 h-3 text-gray-400" />
              </div>
            )}
            <span 
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                partCount > 0 ? "bg-red-900/50 text-red-300" : "bg-gray-800 text-gray-500"
              )}
            >
              {partCount}
            </span>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {children
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map(child => renderLocation(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Get root locations (no parent)
  const rootLocations = locations
    .filter(loc => !loc.parent_id && loc.active)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // Show unassigned parts as a special node
  const unassignedCount = parts.filter(p => !p.location_id).length;

  return (
    <div className="space-y-1">
      {/* Unassigned Parts Node */}
      {unassignedCount > 0 && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
            "hover:bg-red-950/20",
            selectedLocation === 'unassigned' && "bg-red-950/40 border-l-4 border-yellow-500"
          )}
          onClick={() => onLocationSelect('unassigned')}
        >
          <MapPin className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-medium text-gray-300 flex-1">
            Unassigned Location
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300">
            {unassignedCount}
          </span>
        </div>
      )}

      {/* Location Hierarchy */}
      {rootLocations.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No locations found
        </div>
      ) : (
        rootLocations.map(location => renderLocation(location, 0))
      )}
    </div>
  );
}