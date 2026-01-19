import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Package, Box, Image as ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
import ImageGallery from "./ImageGallery";
import PartActionsDropdown from "./PartActionsDropdown";

/**
 * PartsGrid - Displays parts in a card/grid format
 * Uses InventoryItem for stock/available calculations
 * NO LONGER uses Part.quantity_on_hand, Part.status, or PartBuildAssignment
 */
export default function PartsGrid({ 
  parts, 
  categories,
  selectedCategoryId,
  onPartClick,
  showGrouping = true,
  onAddInventory,
  onOrderPart,
  onAddToBuild,
  onAddToNeedToBuy,
}) {
  const [galleryState, setGalleryState] = useState({
    open: false,
    images: [],
    currentIndex: 0,
  });
  const [expandedGroups, setExpandedGroups] = useState({});

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
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

  // Use InventoryItem for stock calculations
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // Use PartPurchaseLineItem for on-order calculations
  const { data: lineItems = [] } = useQuery({
    queryKey: ['partPurchaseLineItems'],
    queryFn: () => base44.entities.PartPurchaseLineItem.list(),
  });

  // Use PartProjectRequirement for need-to-buy calculations
  const { data: requirements = [] } = useQuery({
    queryKey: ['partProjectRequirements'],
    queryFn: () => base44.entities.PartProjectRequirement.list(),
  });

  const getInventoryStats = (partId) => {
    const items = inventoryItems.filter(i => i.part_id === partId);
    const onHand = items.reduce((sum, i) => sum + (i.quantity_on_hand || 0), 0);
    const reserved = items.reduce((sum, i) => sum + (i.quantity_reserved || 0), 0);
    
    // On Order = qty_ordered - qty_received from open PO lines
    const partLineItems = lineItems.filter(li => li.part_id === partId);
    const onOrder = partLineItems.reduce((sum, li) => 
      sum + Math.max(0, (li.qty_ordered || 0) - (li.qty_received || 0)), 0);
    
    // Need = sum of (qty_needed - qty_installed - qty_allocated) for all requirements
    const partReqs = requirements.filter(r => r.part_id === partId);
    const need = partReqs.reduce((sum, r) => {
      const stillNeeded = (r.qty_needed || 0) - (r.qty_installed || 0) - (r.qty_allocated || 0);
      return sum + Math.max(0, stillNeeded);
    }, 0);
    
    return { onHand, available: onHand - reserved, need, onOrder };
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Build hierarchical groups matching list view
  const buildHierarchicalGroups = () => {
    if (!showGrouping) {
      return [{ label: 'All Parts', parts, color: '#6B7280', children: [] }];
    }

    const parentCategories = categories
      .filter(c => !c.parent_id && c.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const groups = [];

    // Group for parts with no category
    const noCategoryParts = parts.filter(p => !p.part_category_id);
    if (noCategoryParts.length > 0) {
      groups.push({
        label: 'No Category',
        parts: noCategoryParts,
        color: '#6B7280',
        children: []
      });
    }

    // Build hierarchy for each parent category
    parentCategories.forEach(parent => {
      const childCategories = categories
        .filter(c => c.parent_id === parent.id && c.active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      const parentParts = parts.filter(p => p.part_category_id === parent.id);
      const children = [];

      childCategories.forEach(child => {
        const childParts = parts.filter(p => p.part_category_id === child.id);
        if (childParts.length > 0) {
          children.push({
            label: child.name,
            parts: childParts,
            color: child.color || parent.color || '#6B7280',
            children: []
          });
        }
      });

      if (parentParts.length > 0 || children.length > 0) {
        groups.push({
          label: parent.name,
          parts: parentParts,
          color: parent.color || '#6B7280',
          children
        });
      }
    });

    return groups;
  };

  const hierarchicalGroups = buildHierarchicalGroups();

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
        <div className="space-y-3">
          {hierarchicalGroups.map(group => renderGroup(group))}
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

  function renderGroup(group, level = 0) {
    const groupKey = `${level}-${group.label}`;
    const isExpanded = expandedGroups[groupKey] !== false;
    const totalParts = group.parts.length + group.children.reduce((sum, child) => sum + child.parts.length, 0);

    return (
      <div key={groupKey} className={level > 0 ? 'ml-4' : ''}>
        {showGrouping && (
          <button
            onClick={() => toggleGroup(groupKey)}
            className="flex items-center gap-2 w-full p-2 mb-2 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/30 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
            <div 
              className="w-3 h-3 rounded"
              style={{ backgroundColor: group.color }}
            />
            <span className="text-sm font-medium text-white flex-1 text-left">
              {group.label}
            </span>
            <span className="text-xs text-gray-400">
              {totalParts} part{totalParts !== 1 ? 's' : ''}
            </span>
          </button>
        )}

        {isExpanded && (
          <div className="space-y-3 mb-3">
            {group.parts.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {group.parts.map(part => {
            const vendor = vendors.find(v => v.id === part.default_vendor_id);
            const make = makes.find(m => m.id === part.car_make_id);
            const model = models.find(m => m.id === part.car_model_id);
            const year = years.find(y => y.id === part.car_year_id);
            const images = part.photos || [];
            const featuredPhoto = part.featured_photo || images[0];
            const stats = getInventoryStats(part.id);
            const hasMultipleImages = images.length > 1;

            return (
              <div
                key={part.id}
                onClick={() => onPartClick(part)}
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
                    {part.is_active === false && (
                      <Badge variant="outline" className="border-red-500 text-red-400 text-xs shrink-0">
                        Inactive
                      </Badge>
                    )}
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
                  <div className="grid grid-cols-4 gap-1 mb-2 pt-2 border-t border-gray-800">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Stock</p>
                      <p className="text-sm text-white font-semibold">{stats.onHand}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Available</p>
                      <p className={`text-sm font-semibold ${stats.available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stats.available}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Need</p>
                      <p className={`text-sm font-semibold ${stats.need > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {stats.need}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">On Order</p>
                      <p className={`text-sm font-semibold ${stats.onOrder > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                        {stats.onOrder}
                      </p>
                    </div>
                  </div>

                  {/* Vendor and Actions */}
                  <div className="flex items-center justify-between text-xs">
                    {vendor ? (
                      <div className="flex items-center gap-1 text-gray-400">
                        <Box className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">
                          {vendor.vendor_name}
                        </span>
                      </div>
                    ) : (
                      <div />
                    )}
                    <PartActionsDropdown
                      part={part}
                      onAddInventory={onAddInventory}
                      onOrderPart={onOrderPart}
                      onAddToBuild={onAddToBuild}
                      onAddToNeedToBuy={onAddToNeedToBuy}
                      onViewDetails={onPartClick}
                    />
                  </div>
                </div>
              </div>
            );
          })}
              </div>
            )}
            {group.children.map(child => renderGroup(child, level + 1))}
          </div>
        )}
      </div>
    );
  }
}