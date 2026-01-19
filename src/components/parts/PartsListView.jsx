import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Package, MapPin, Box, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageGallery from "./ImageGallery";
import PartActionsDropdown from "./PartActionsDropdown";

/**
 * PartsListView - Displays parts in a list format
 * Uses InventoryItem for stock/available calculations
 * NO LONGER uses Part.quantity_on_hand, Part.status, or PartBuildAssignment
 */
export default function PartsListView({ 
  parts, 
  categories,
  selectedCategoryId,
  onPartClick,
  showGrouping,
  onAddInventory,
  onOrderPart,
  onAddToBuild,
  onAddToNeedToBuy,
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

  // Group parts hierarchically by category
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

  const PartRow = ({ part }) => {
    const images = part.photos || [];
    const featuredPhoto = part.featured_photo || images[0];
    const stats = getInventoryStats(part.id);
    const hasMultipleImages = images.length > 1;
    const vendor = vendors.find(v => v.id === part.default_vendor_id);
    const make = makes.find(m => m.id === part.car_make_id);
    const model = models.find(m => m.id === part.car_model_id);
    const year = years.find(y => y.id === part.car_year_id);

    return (
      <div
        onClick={() => onPartClick(part)}
        className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-gray-900/30 rounded-lg border border-gray-800 hover:border-red-900/50 transition-all cursor-pointer group min-h-[88px]"
      >
        {/* Mobile: Top row with thumbnail and title */}
        <div className="flex items-start gap-3 w-full md:w-auto md:flex-1">
          {/* Thumbnail */}
          <div 
            className="relative w-16 h-16 md:w-12 md:h-12 flex-shrink-0 bg-gray-800 rounded overflow-hidden cursor-pointer"
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
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start gap-2">
              <h4 className="text-white text-sm font-medium line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">
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
              <div className="text-xs text-gray-400 font-mono truncate">
                {part.vendor_part_number}
              </div>
            )}

            {/* Vehicle Info */}
            {(make || model || year) && (
              <div className="text-xs text-blue-400 truncate">
                {[make?.name, model?.name, year?.year].filter(Boolean).join(' ')}
              </div>
            )}

            {/* Vendor */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-x-3 text-xs text-gray-400">
              {vendor && (
                <span className="flex items-center gap-1 truncate">
                  <Box className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{vendor.vendor_name}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inventory Stats - Mobile full width, desktop auto */}
        <div className="flex justify-around md:justify-end md:gap-4 text-xs shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-800">
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Stock</div>
            <div className="text-white font-semibold">{stats.onHand}</div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Available</div>
            <div className={cn(
              "font-semibold",
              stats.available > 0 ? "text-green-400" : "text-red-400"
            )}>
              {stats.available}
            </div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Need</div>
            <div className={cn(
              "font-semibold",
              stats.need > 0 ? "text-red-400" : "text-gray-500"
            )}>
              {stats.need}
            </div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">On Order</div>
            <div className={cn(
              "font-semibold",
              stats.onOrder > 0 ? "text-orange-400" : "text-gray-500"
            )}>
              {stats.onOrder}
            </div>
          </div>
        </div>

        {/* Actions Dropdown */}
        <div className="hidden md:block ml-2">
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
    );
  };

  const renderGroup = (group, level = 0) => {
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
          <div className="space-y-2 mb-3">
            {group.parts.map(part => (
              <PartRow key={part.id} part={part} />
            ))}
            {group.children.map(child => renderGroup(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {hierarchicalGroups.map(group => renderGroup(group))}

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