import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, FolderTree } from "lucide-react";

export default function PartCategoriesManager() {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parentCategories.map(parent => {
            const children = getChildCategories(parent.id);
            const parentPartCount = getPartsCountForCategory(parent.id);
            const totalChildrenCount = children.reduce(
              (sum, child) => sum + getPartsCountForCategory(child.id), 
              0
            );
            const totalCount = parentPartCount + totalChildrenCount;

            return (
              <Card 
                key={parent.id}
                className="bg-black/40 backdrop-blur-xl border border-red-900/30 hover:border-red-900/50 transition-colors"
              >
                <CardHeader 
                  className="border-b p-4"
                  style={{ 
                    borderColor: parent.color + '40',
                    backgroundColor: parent.color + '10'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle 
                      className="text-base font-semibold"
                      style={{ color: parent.color }}
                    >
                      {parent.name}
                    </CardTitle>
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
                  {!parent.active && (
                    <Badge variant="outline" className="border-gray-600 text-gray-500 mt-2">
                      Inactive
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="p-4">
                  {children.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">No subcategories</p>
                      {parentPartCount > 0 && (
                        <p className="text-xs text-gray-600 mt-1">
                          {parentPartCount} parts in this category
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {children.map(child => {
                        const childPartCount = getPartsCountForCategory(child.id);
                        
                        return (
                          <div
                            key={child.id}
                            className="flex items-center justify-between p-2 bg-gray-900/50 rounded border border-gray-800"
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
                      {parentPartCount > 0 && (
                        <div className="flex items-center justify-between p-2 bg-gray-900/50 rounded border border-gray-800">
                          <span className="text-sm text-white">Direct (uncategorized)</span>
                          <Badge 
                            variant="outline"
                            className="text-xs border-gray-700"
                            style={{ color: parent.color }}
                          >
                            {parentPartCount}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}