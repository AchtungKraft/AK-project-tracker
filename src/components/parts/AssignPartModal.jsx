import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import AddPartModal from "./AddPartModal";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

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

export default function AssignPartModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddPartModal, setShowAddPartModal] = useState(false);

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list('-created_date'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list(),
  });

  const { data: partAssignments = [] } = useQuery({
    queryKey: ['partBuildAssignments', projectId],
    queryFn: () => base44.entities.PartBuildAssignment.filter({ project_id: projectId }),
  });

  const assignPartMutation = useMutation({
    mutationFn: (data) => base44.entities.PartBuildAssignment.create(data),
    onSuccess: async (_, variables) => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: variables.part_id ? [variables.part_id] : [],
        projectIds: [projectId],
      });
      toast.success('Part assigned to build');
    },
  });

  const assignedPartIds = partAssignments.map(a => a.part_id);
  const unassignedParts = parts.filter(p => !assignedPartIds.includes(p.id) && !p.global_all_builds);
  const globalParts = parts.filter(p => p.global_all_builds);

  const filterParts = (partsList) => {
    if (!searchTerm) return partsList;
    return partsList.filter(p => 
      p.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredUnassigned = filterParts(unassignedParts);
  const filteredGlobal = filterParts(globalParts);

  const handleAssignPart = (partId) => {
    assignPartMutation.mutate({
      project_id: projectId,
      part_id: partId
    });
  };

  const statusColors = {
    'On-Hand': '#10B981',
    'Need to Buy': '#EF4444',
    'On-Order': '#F59E0B'
  };

  const renderPartCard = (part, isGlobal = false) => {
    const categoryPath = getCategoryPath(part.part_category_id, categories);
    const category = categories.find(c => c.id === part.part_category_id);
    const isAssigning = assignPartMutation.isPending;

    return (
      <div 
        key={part.id}
        className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-red-900/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-medium truncate">{part.part_name}</h4>
            {part.vendor_part_number && (
              <p className="text-xs text-gray-400 font-mono mt-1">{part.vendor_part_number}</p>
            )}
          </div>
          <Badge 
            style={{ backgroundColor: statusColors[part.status] }}
            className="text-white text-xs shrink-0"
          >
            {part.status}
          </Badge>
        </div>

        {part.photos && part.photos.length > 0 && (
          <div className="w-full h-24 bg-gray-800 rounded mb-2 flex items-center justify-center overflow-hidden">
            <img
              src={part.photos[0]}
              alt={part.part_name}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}

        <div className="space-y-1 mb-3 text-sm">
          {categoryPath && (
            <div className="flex justify-between">
              <span className="text-gray-400">Category:</span>
              <span style={{ color: category?.color || '#fff' }} className="text-right">
                {categoryPath}
              </span>
            </div>
          )}
          {part.car_year && (
            <div className="flex justify-between">
              <span className="text-gray-400">Year/Model:</span>
              <span className="text-white">{part.car_year} {part.car_model}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">Qty On Hand:</span>
            <span className="text-white font-semibold">{part.quantity_on_hand || 0}</span>
          </div>
        </div>

        {isGlobal ? (
          <Badge variant="outline" className="border-green-500 text-green-400 w-full justify-center">
            <CheckCircle className="w-3 h-3 mr-1" />
            Already Available (Global)
          </Badge>
        ) : (
          <Button
            onClick={() => handleAssignPart(part.id)}
            disabled={isAssigning}
            size="sm"
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {isAssigning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Assign to Build
              </>
            )}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-red-900/30">
          <DialogHeader>
            <DialogTitle className="text-white">Assign Parts to Build</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="unassigned" className="w-full">
              <TabsList className="bg-gray-800 border border-gray-700 w-full">
                <TabsTrigger value="unassigned" className="flex-1">
                  Available Parts
                  <Badge variant="outline" className="ml-2 border-gray-600">
                    {filteredUnassigned.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="global" className="flex-1">
                  Global Parts
                  <Badge variant="outline" className="ml-2 border-green-600 text-green-400">
                    {filteredGlobal.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="unassigned" className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-gray-400">
                    Parts not yet assigned to this build
                  </p>
                  <Button
                    onClick={() => setShowAddPartModal(true)}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Part
                  </Button>
                </div>

                {filteredUnassigned.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">
                      {searchTerm ? 'No matching parts found' : 'All available parts are assigned'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-2">
                    {filteredUnassigned.map(part => renderPartCard(part))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="global" className="mt-4">
                <p className="text-sm text-gray-400 mb-4">
                  Global parts are automatically available for all builds
                </p>

                {filteredGlobal.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">
                      {searchTerm ? 'No matching global parts found' : 'No global parts configured'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-2">
                    {filteredGlobal.map(part => renderPartCard(part, true))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Footer */}
            <div className="flex justify-end pt-4 border-t border-gray-800">
              <Button
                onClick={onClose}
                variant="outline"
                className="border-gray-700"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showAddPartModal && (
        <AddPartModal onClose={() => setShowAddPartModal(false)} />
      )}
    </>
  );
}