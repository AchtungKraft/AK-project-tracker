import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, FolderTree, ChevronDown, ChevronRight, X as XIcon } from "lucide-react";
import PartDetailModal from "./PartDetailModal";

const getCategoryPath = (categoryId, categories) => {
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

export default function PartCategoriesManager() {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [selectedPart, setSelectedPart] = useState(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
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

  const getPartsCountForCategory = (categoryId) => {
    return parts.filter(p => p.part_category_id === categoryId).length;
  };

  const parentCategories = categories
    .filter(c => !c.parent_id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const getChildCategories = (parentId) => {
    return categories
      .filter(c => c.parent_id === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };

  const toggleCategory = (categoryId) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const handleCategoryClick = (categoryId) => {
    setSelectedCategoryId(categoryId);
  };

  const selectedCategoryParts = selectedCategoryId 
    ? parts.filter(p => p.part_category_id === selectedCategoryId)
    : [];

  const statusColors = {
    'On-Hand': '#10B981',
    'Need to Buy': '#EF4444',
    'On-Order': '#F59E0B'
  };

  return (
    <div className="space-y-4">
      <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
        <CardHeader className="border-b border-red-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-gray-400" />
              <CardTitle className="text-white text-base">Part Categories</CardTitle>
            </div>
            <p className="text-sm text-gray-400">
              Manage categories in Admin Config → Part Categories
            </p>
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading categories...</div>
      ) : parentCategories.length === 0 ? (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-900/30">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No categories configured yet.</p>
            <p className="text-sm text-gray-600 mt-2">
              Add categories in Admin Config → Part Categories
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {parentCategories.map(parent => {
            const children = getChildCategories(parent.id);
            const parentPartCount = getPartsCountForCategory(parent.id);
            const totalChildrenCount = children.reduce(
              (sum, child) => sum + getPartsCountForCategory(child.id), 
              0
            );
            const totalCount = parentPartCount + totalChildrenCount;
            const isCollapsed = collapsedCategories[parent.id];

            return (
              <Card 
                key={parent.id}
                className="bg-black/40 backdrop-blur-xl border border-red-900/30"
              >
                <CardHeader 
                  className="border-b p-4 cursor-pointer hover:bg-gray-900/20 transition-colors"
                  style={{ 
                    borderColor: parent.color + '40',
                    backgroundColor: parent.color + '10'
                  }}
                  onClick={() => toggleCategory(parent.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {children.length > 0 && (
                        isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                      <CardTitle 
                        className="text-base font-semibold"
                        style={{ color: parent.color }}
                      >
                        {parent.name}
                      </CardTitle>
                    </div>
                    <Badge 
                      style={{ 
                        backgroundColor: parent.color + '30',
                        color: parent.color,
                        borderColor: parent.color
                      }}
                      className="border"
                    >
                      {totalCount} parts
                    </Badge>
                  </div>
                  {parent.description && (
                    <p className="text-xs text-gray-400 mt-2">{parent.description}</p>
                  )}
                </CardHeader>
                
                {!isCollapsed && (
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      {/* Parent category direct parts */}
                      {parentPartCount > 0 && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategoryClick(parent.id);
                          }}
                          className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                            selectedCategoryId === parent.id 
                              ? 'bg-red-900/30 border-red-600' 
                              : 'bg-gray-900/50 border-gray-800 hover:border-red-900/50'
                          }`}
                        >
                          <span className="text-sm text-white">
                            Direct (in {parent.name})
                          </span>
                          <Badge 
                            variant="outline"
                            className="text-xs border-gray-700"
                            style={{ color: parent.color }}
                          >
                            {parentPartCount}
                          </Badge>
                        </div>
                      )}

                      {/* Child categories */}
                      {children.map(child => {
                        const childPartCount = getPartsCountForCategory(child.id);
                        
                        return (
                          <div
                            key={child.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCategoryClick(child.id);
                            }}
                            className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                              selectedCategoryId === child.id 
                                ? 'bg-red-900/30 border-red-600' 
                                : 'bg-gray-900/50 border-gray-800 hover:border-red-900/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <div 
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: child.color }}
                              />
                              <span 
                                className={`text-sm ${child.active ? 'text-white' : 'text-gray-500 line-through'}`}
                              >
                                {child.name}
                              </span>
                            </div>
                            <Badge 
                              variant="outline"
                              className="text-xs border-gray-700"
                              style={{ color: child.color }}
                            >
                              {childPartCount}
                            </Badge>
                          </div>
                        );
                      })}

                      {children.length === 0 && parentPartCount === 0 && (
                        <div className="text-center py-4">
                          <p className="text-sm text-gray-500">No parts in this category</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Selected Category Parts List */}
      {selectedCategoryId && (
        <Card className="bg-black/40 backdrop-blur-xl border border-red-600/50">
          <CardHeader className="border-b border-red-900/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-red-400" />
                <CardTitle className="text-white text-base">
                  Parts in {getCategoryPath(selectedCategoryId, categories)}
                </CardTitle>
                <Badge variant="outline" className="border-red-600 text-red-400">
                  {selectedCategoryParts.length} parts
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedCategoryId(null)}
                className="text-gray-400 hover:text-white"
              >
                <XIcon className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {selectedCategoryParts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No parts in this category
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedCategoryParts.map(part => {
                  const vendor = vendors.find(v => v.id === part.vendor_id);
                  const location = locations.find(l => l.id === part.location_id);
                  const make = makes.find(m => m.id === part.car_make_id);
                  const model = models.find(m => m.id === part.car_model_id);
                  const year = years.find(y => y.id === part.car_year_id);
                  
                  return (
                    <div
                      key={part.id}
                      onClick={() => setSelectedPart(part)}
                      className="p-3 bg-gray-900/50 rounded border border-gray-700 hover:border-red-900/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h5 className="text-white text-sm font-medium flex-1">
                          {part.part_name}
                        </h5>
                        <Badge 
                          style={{ backgroundColor: statusColors[part.status] }}
                          className="text-white text-xs shrink-0"
                        >
                          {part.status}
                        </Badge>
                      </div>
                      {part.vendor_part_number && (
                        <p className="text-xs text-gray-400 font-mono mb-2">
                          {part.vendor_part_number}
                        </p>
                      )}
                      {(make || model || year) && (
                        <p className="text-xs text-blue-400 mb-2">
                          {[make?.name, model?.name, year?.year].filter(Boolean).join(' ')}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Qty:</span>
                        <span className="text-white font-semibold">
                          {part.quantity_on_hand || 0}
                        </span>
                      </div>
                      {vendor && (
                        <p className="text-xs text-gray-500">Vendor: {vendor.vendor_name}</p>
                      )}
                      {location && (
                        <p className="text-xs text-gray-500">
                          Location: {location.bin_description || location.location_area}
                        </p>
                      )}
                      {part.global_all_builds && (
                        <Badge variant="outline" className="border-green-500 text-green-400 text-xs mt-2">
                          Global
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedPart && (
        <PartDetailModal
          part={selectedPart}
          onClose={() => setSelectedPart(null)}
        />
      )}
    </div>
  );
}