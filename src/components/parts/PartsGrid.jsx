import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Package, MapPin, Box, Image as ImageIcon } from "lucide-react";
import ImageGallery from "./ImageGallery";

const statusColors = {
  'On-Hand': '#10B981',
  'Need to Buy': '#EF4444',
  'On-Order': '#F59E0B'
};

export default function PartsGrid({ 
  parts, 
  categories,
  selectedCategoryId,
  onPartClick,
}) {
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

  const openGallery = (images, index = 0) => {
    setGalleryState({
      open: true,
      images,
      currentIndex: index,
    });
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

  return (
    <div className="h-full">
      {parts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <Package className="w-16 h-16 text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">
            {selectedCategoryId ? 'No parts in this category' : 'No parts found'}
          </h3>
          <p className="text-sm text-gray-600">
            {selectedCategoryId ? 'This category is empty' : 'Add parts to get started'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {parts.map(part => {
            const vendor = vendors.find(v => v.id === part.vendor_id);
            const location = locations.find(l => l.id === part.location_id);
            const make = makes.find(m => m.id === part.car_make_id);
            const model = models.find(m => m.id === part.car_model_id);
            const year = years.find(y => y.id === part.car_year_id);
            const images = part.photos || [];
            const featuredPhoto = part.featured_photo || images[0];
            const available = getPartAvailable(part);
            const reserved = getPartReserved(part.id);
            const hasMultipleImages = images.length > 1;

            return (
              <div
                key={part.id}
                onClick={() => onPartClick(part.id)}
                className="bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group"
              >
                {/* Image Section */}
                {featuredPhoto ? (
                  <div 
                    className="relative h-32 bg-gray-800 rounded-t-lg flex items-center justify-center overflow-hidden cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      openGallery(images, 0);
                    }}
                  >
                    <img
                      src={featuredPhoto}
                      alt={part.part_name}
                      className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform"
                    />
                    {hasMultipleImages && (
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {images.length}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-32 bg-gray-800 rounded-t-lg flex items-center justify-center">
                    <Package className="w-12 h-12 text-gray-600" />
                  </div>
                )}

                {/* Content Section */}
                <div className="p-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-white text-sm font-semibold line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">
                      {part.part_name}
                    </h4>
                    <Badge 
                      style={{ backgroundColor: statusColors[part.status] }}
                      className="text-white text-xs shrink-0"
                    >
                      {part.status}
                    </Badge>
                  </div>

                  {/* Part Number */}
                  {part.vendor_part_number && (
                    <p className="text-xs text-gray-400 font-mono mb-2">
                      {part.vendor_part_number}
                    </p>
                  )}

                  {/* Vehicle Info */}
                  {(make || model || year) && (
                    <p className="text-xs text-blue-400 mb-2 truncate">
                      {[make?.name, model?.name, year?.year].filter(Boolean).join(' ')}
                    </p>
                  )}

                  {/* Inventory Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-2 pt-2 border-t border-gray-800">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Stock</p>
                      <p className="text-sm text-white font-semibold">{part.quantity_on_hand || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Reserved</p>
                      <p className="text-sm text-yellow-400 font-semibold">{reserved}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Available</p>
                      <p className={`text-sm font-semibold ${available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {available}
                      </p>
                    </div>
                  </div>

                  {/* Location & Vendor */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {location && (
                      <div className="flex items-center gap-1 text-gray-400">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate max-w-[120px]">
                          {location.bin_description || location.location_area}
                        </span>
                      </div>
                    )}
                    {vendor && (
                      <div className="flex items-center gap-1 text-gray-400">
                        <Box className="w-3 h-3" />
                        <span className="truncate max-w-[100px]">
                          {vendor.vendor_name}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Global Badge */}
                  {part.global_all_builds && (
                    <div className="mt-2 pt-2 border-t border-gray-800">
                      <Badge variant="outline" className="border-green-500 text-green-400 text-xs">
                        Global
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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