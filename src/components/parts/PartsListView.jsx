import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Package, MapPin, Box, Image as ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageGallery from "./ImageGallery";

const statusColors = {
  'On-Hand': '#10B981',
  'Need to Buy': '#EF4444',
  'On-Order': '#F59E0B'
};

export default function PartsListView({ 
  parts, 
  categories,
  selectedCategoryId,
  onPartClick,
  showGrouping
}) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [galleryState, setGalleryState] = useState({
    open: false,
    images: [],
    currentIndex: 0,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const { data: makes = [] } = useQuery({
    queryKey: ['carMakes'],
    queryFn: () => base44.entities.CarMake.list(),
  });

  const { data: models = [] } = useQuery({
    queryKey: ['carModels'],
    queryFn: () => base44.entities.CarModel.list(),
  });

  const { data: years = [] } = useQuery({
    queryKey: ['carYears'],
    queryFn: () => base44.entities.CarYear.list(),
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments'],
    queryFn: () => base44.entities.PartBuildAssignment.list(),
  });

  const getPartReserved = (partId) => {
    return allAssignments
      .filter(a => a.part_id === partId)
      .reduce((sum, a) => sum + (a.qty_needed || 0), 0);
  };

  const getPartAvailable = (part) => {
    const reserved = getPartReserved(part.id);
    return (part.quantity_on_hand || 0) - reserved;
  };

  const getCategoryPath = (categoryId) => {
    if (!categoryId) return null;
    const category = categories.find(c => c.id === categoryId);
    if (!category) return null;
    
    if (category.parent_id) {
      const parent = categories.find(c => c.id === category.parent_id);
      if (parent) {
        return `${parent.name} > ${category.name}`;
      }
    }
    return category.name;
  };

  const openGallery = (images, index = 0) => {
    setGalleryState({ open: true, images, currentIndex: index });
  };

  const closeGallery = () => {
    setGalleryState(prev => ({ ...prev, open: false }));
  };

  const navigateGallery = (direction) => {
    setGalleryState(prev => {
      if (typeof direction === 'number') {
        return { ...prev, currentIndex: direction };
      }
      const newIndex = direction === 'next' 
        ? Math.min(prev.currentIndex + 1, prev.images.length - 1)
        : Math.max(prev.currentIndex - 1, 0);
      return { ...prev, currentIndex: newIndex };
    });
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Group parts by category
  const groupedParts = {};
  if (showGrouping) {
    parts.forEach(part => {
      const categoryPath = getCategoryPath(part.part_category_id);
      const groupKey = categoryPath || 'No Category';
      const category = categories.find(c => c.id === part.part_category_id);
      
      if (!groupedParts[groupKey]) {
        groupedParts[groupKey] = {
          parts: [],
          color: category?.color || '#6B7280'
        };
      }
      groupedParts[groupKey].parts.push(part);
    });
  } else {
    groupedParts['All Parts'] = { parts, color: '#6B7280' };
  }

  const PartRow = ({ part }) => {
    const images = part.photos || [];
    const featuredPhoto = part.featured_photo || images[0];
    const available = getPartAvailable(part);
    const reserved = getPartReserved(part.id);
    const hasMultipleImages = images.length > 1;
    const location = locations.find(l => l.id === part.location_id);
    const vendor = vendors.find(v => v.id === part.vendor_id);
    const make = makes.find(m => m.id === part.car_make_id);
    const model = models.find(m => m.id === part.car_model_id);
    const year = years.find(y => y.id === part.car_year_id);

    return (
      <div
        onClick={() => onPartClick(part.id)}
        className="flex items-center gap-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group"
      >
        {/* Thumbnail */}
        <div 
          className="relative w-12 h-12 flex-shrink-0 bg-gray-800 rounded overflow-hidden cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (images.length > 0) openGallery(images, 0);
          }}
        >
          {featuredPhoto ? (
            <>
              <img
                src={featuredPhoto}
                alt={part.part_name}
                className="w-full h-full object-cover"
              />
              {hasMultipleImages && (
                <div className="absolute bottom-0 right-0 bg-black/80 text-white text-xs px-1 rounded-tl">
                  {images.length}
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-6 h-6 text-gray-600" />
            </div>
          )}
        </div>

        {/* Part Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <h4 className="text-white text-sm font-medium truncate flex-1 group-hover:text-red-400 transition-colors">
              {part.part_name}
            </h4>
            <Badge 
              style={{ backgroundColor: statusColors[part.status] }}
              className="text-white text-xs shrink-0"
            >
              {part.status}
            </Badge>
          </div>
          
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            {part.vendor_part_number && (
              <span className="font-mono">{part.vendor_part_number}</span>
            )}
            {(make || model || year) && (
              <span className="text-blue-400">
                {[make?.name, model?.name, year?.year].filter(Boolean).join(' ')}
              </span>
            )}
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {location.bin_description || location.location_area}
              </span>
            )}
            {vendor && (
              <span className="flex items-center gap-1">
                <Box className="w-3 h-3" />
                {vendor.vendor_name}
              </span>
            )}
          </div>
        </div>

        {/* Inventory Stats */}
        <div className="flex gap-4 text-xs shrink-0">
          <div className="text-center">
            <div className="text-gray-500">Stock</div>
            <div className="text-white font-semibold">{part.quantity_on_hand || 0}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Reserved</div>
            <div className="text-yellow-400 font-semibold">{reserved}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Available</div>
            <div className={cn(
              "font-semibold",
              available > 0 ? "text-green-400" : "text-red-400"
            )}>
              {available}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {Object.entries(groupedParts).map(([groupLabel, groupData]) => {
        const isExpanded = expandedGroups[groupLabel] !== false;
        const { parts: groupParts, color } = groupData;

        return (
          <div key={groupLabel}>
            {showGrouping && (
              <button
                onClick={() => toggleGroup(groupLabel)}
                className="flex items-center gap-2 w-full p-2 mb-2 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm font-medium text-white flex-1 text-left">
                  {groupLabel}
                </span>
                <span className="text-xs text-gray-400">
                  {groupParts.length} parts
                </span>
              </button>
            )}

            {isExpanded && (
              <div className="space-y-2">
                {groupParts.map(part => (
                  <PartRow key={part.id} part={part} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <ImageGallery
        isOpen={galleryState.open}
        images={galleryState.images}
        currentIndex={galleryState.currentIndex}
        onClose={closeGallery}
        onNavigate={navigateGallery}
      />
    </div>
  );
}