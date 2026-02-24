import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Package, MapPin, Box, ChevronDown, ChevronRight, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import ImageGallery from "./ImageGallery";
import PartActionsDropdown from "./PartActionsDropdown";
import { PartTypeBadge } from "./PartTypeSelector";
import { getPartRetailEffectiveSafe, formatCurrency } from "@/components/supply/pricingHelpers";
import { useFinancialStatusBatch } from "@/components/financial/useFinancialStatus";
import FinancialStatusBadge from "@/components/financial/FinancialStatusBadge";

/**
 * PartsListView - CANONICAL: Displays parts in a list format
 * Uses getPartsInventoryView read model for stock/available calculations
 * NO InventoryItem.list() aggregation. NO local reduce() for stock totals.
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

  // CANONICAL: Use read model for inventory view - NO local InventoryItem math
  const { data: partsInventoryView = [] } = useQuery({
    queryKey: ['partsInventoryView'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getPartsInventoryView', {});
      return res.data?.parts || [];
    },
  });

  // Build lookup map for canonical inventory stats
  const inventoryViewMap = useMemo(() => {
    const map = new Map();
    partsInventoryView.forEach(p => map.set(p.part_id, p));
    return map;
  }, [partsInventoryView]);

  // Batch resolve financial status for displayed parts
  const financialContexts = useMemo(() => {
    return parts.map(p => ({ part_id: p.id }));
  }, [parts]);
  
  const { data: financialStatuses = [] } = useFinancialStatusBatch(financialContexts, {
    enabled: parts.length > 0,
  });
  
  const financialStatusMap = useMemo(() => {
    const map = new Map();
    financialStatuses.forEach(fs => {
      map.set(fs.part_id, fs);
    });
    return map;
  }, [financialStatuses]);

  /**
   * getInventoryStats - CANONICAL: Returns stats from read model only
   * NO local computation. NO legacy fields.
   * Returns: { onHand, available, need, onOrder, toOrder, reserved, projectCount }
   */
  const getInventoryStats = (part) => {
    // Look up canonical data from read model
    const canonical = inventoryViewMap.get(part.id);
    
    if (canonical) {
      // CANONICAL VERIFICATION LOG
      console.log('[PartsListView CANONICAL]', {
        part_id: part.id,
        physical_stock: canonical.physical_stock,
        reserved_total: canonical.reserved_total,
        available: canonical.available,
        to_order: canonical.to_order,
        on_order: canonical.on_order
      });
      
      return {
        onHand: canonical.physical_stock ?? 0,
        available: canonical.available ?? 0,
        need: canonical.required_total ?? 0,
        onOrder: canonical.on_order ?? 0,
        toOrder: canonical.to_order ?? 0,
        reserved: canonical.reserved_total ?? 0,
        projectCount: canonical.projects_using_count ?? 0
      };
    }
    
    // Read model not loaded yet - return zeros, don't compute locally
    console.warn('[PartsListView] Read model not loaded for part', part.id);
    return {
      onHand: 0,
      available: 0,
      need: 0,
      onOrder: 0,
      toOrder: 0,
      reserved: 0,
      projectCount: 0
    };
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

  // Build a map of category name -> category for matching
  const categoryNameMap = useMemo(() => {
    const map = {};
    categories.forEach(cat => {
      if (cat.name) {
        map[cat.name.toLowerCase()] = cat;
      }
    });
    return map;
  }, [categories]);

  // Helper to get the category ID for a part (supports both part_category_id and category string)
  const getPartCategoryId = (part) => {
    if (part.part_category_id) return part.part_category_id;
    if (part.category) {
      const cat = categoryNameMap[part.category.toLowerCase()];
      return cat?.id;
    }
    return null;
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
    const noCategoryParts = parts.filter(p => !getPartCategoryId(p));
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

      const parentParts = parts.filter(p => getPartCategoryId(p) === parent.id);
      const children = [];

      childCategories.forEach(child => {
        const childParts = parts.filter(p => getPartCategoryId(p) === child.id);
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
    const stats = getInventoryStats(part); // Now pass full part object
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
            <div className="flex items-start gap-2 flex-wrap">
              <h4 className="text-white text-sm font-medium line-clamp-2 flex-1 group-hover:text-red-400 transition-colors">
                {part.part_name}
              </h4>
              {part.is_archived && (
                <Badge className="bg-amber-600 text-white text-xs shrink-0">
                  <Archive className="w-3 h-3 mr-1" />
                  Archived
                </Badge>
              )}
              {part.is_active === false && !part.is_archived && (
                <Badge variant="outline" className="border-red-500 text-red-400 text-xs shrink-0">
                  Inactive
                </Badge>
              )}
              {part.part_type && part.part_type !== 'PURCHASED_VENDOR' && (
                <PartTypeBadge partType={part.part_type} size="sm" />
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

        {/* AK Industrial Mode: Cost + Retail + Warning Badge (if any) + Inventory Stats */}
        <div className="flex justify-around md:justify-end md:gap-4 text-xs shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-800">
          {/* Cost */}
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Cost</div>
            <div className={cn(
              "font-mono",
              (!part.cost || part.cost <= 0) ? "text-gray-500" : "text-gray-300"
            )}>
              {formatCurrency(part.cost || 0)}
            </div>
          </div>
          
          {/* Retail (effective) - Color by pricing_mode: green=matrix, blue=manual; Label red if needs_cost_review */}
          <div className="text-center min-w-[50px]">
            <div className={cn(
              "mb-0.5",
              part.needs_cost_review ? "text-red-500 font-semibold" : "text-gray-500"
            )}>Retail</div>
            {(() => {
              const { value: retail } = getPartRetailEffectiveSafe(part);
              const isManual = part.pricing_mode === 'manual';
              return (
                <div className={cn(
                  "font-mono font-semibold",
                  isManual ? "text-blue-400" : "text-green-400"
                )}>
                  {formatCurrency(retail)}
                </div>
              );
            })()}
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Stock</div>
            <div className="text-white font-semibold">{stats.onHand}</div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Avail</div>
            <div className={cn(
              "font-semibold",
              stats.available > 0 ? "text-green-400" : "text-gray-500"
            )}>
              {stats.available}
            </div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">Demand</div>
            <div className={cn(
              "font-semibold",
              stats.need > 0 ? "text-cyan-400" : "text-gray-500"
            )}>
              {stats.need}
              {stats.projectCount > 0 && (
                <span className="text-gray-500 text-[10px] block">
                  ({stats.projectCount} proj)
                </span>
              )}
            </div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">To Order</div>
            <div className={cn(
              "font-semibold",
              stats.toOrder > 0 ? "text-red-400" : "text-gray-500"
            )}>
              {stats.toOrder}
            </div>
          </div>
          <div className="text-center min-w-[50px]">
            <div className="text-gray-500 mb-0.5">On Order</div>
            <div className={cn(
              "font-semibold",
              stats.onOrder > 0 ? "text-purple-400" : "text-gray-500"
            )}>
              {stats.onOrder}
            </div>
          </div>
          <div className="text-center min-w-[70px]">
            <div className="text-gray-500 mb-0.5">Financial</div>
            <FinancialStatusBadge 
              financialStatus={financialStatusMap.get(part.id)} 
              displayMode="compact" 
            />
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