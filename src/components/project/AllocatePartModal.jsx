import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

export default function AllocatePartModal({ requirement, onClose }) {
  const queryClient = useQueryClient();
  const [allocations, setAllocations] = useState({});

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems', requirement.part_id],
    queryFn: () => base44.entities.InventoryItem.filter({ part_id: requirement.part_id })
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  const part = parts.find(p => p.id === requirement.part_id) || {};

  const allocateMutation = useMutation({
    mutationFn: async (allocationsData) => {
      const updates = [];
      let totalAllocated = requirement.qty_allocated || 0;

      for (const [itemId, qty] of Object.entries(allocationsData)) {
        if (qty > 0) {
          const item = inventoryItems.find(i => i.id === itemId);
          if (item) {
            // Update inventory item - increase reserved
            updates.push(
              base44.entities.InventoryItem.update(itemId, {
                quantity_reserved: (item.quantity_reserved || 0) + qty
              })
            );
            totalAllocated += qty;
          }
        }
      }

      // Update requirement
      const newStatus = totalAllocated >= requirement.qty_needed ? 'Allocated' : 
                       totalAllocated > 0 ? 'Partially Allocated' : 'Needed';
      
      updates.push(
        base44.entities.PartProjectRequirement.update(requirement.id, {
          qty_allocated: totalAllocated,
          status: newStatus
        })
      );

      await Promise.all(updates);
    },
    onSuccess: async () => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: [requirement.part_id],
        projectIds: requirement.project_id ? [requirement.project_id] : [],
      });
      toast.success('Parts allocated successfully');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to allocate: ' + error.message);
    }
  });

  const getLocationName = (locationId) => {
    if (!locationId) return 'No Location';
    const location = locations.find(l => l.id === locationId);
    if (!location) return 'Unknown';
    if (location.parent_id) {
      const parent = locations.find(l => l.id === location.parent_id);
      return parent ? `${parent.location_area} > ${location.location_area}` : location.location_area;
    }
    return location.location_area;
  };

  const stillNeeded = (requirement.qty_needed || 0) - (requirement.qty_allocated || 0);
  const totalSelected = Object.values(allocations).reduce((sum, q) => sum + (Number(q) || 0), 0);

  const handleAllocate = () => {
    if (totalSelected === 0) {
      toast.error('Please select quantities to allocate');
      return;
    }
    allocateMutation.mutate(allocations);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Allocate from Inventory</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Part Info */}
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-3">
              <p className="text-white font-medium">{part.part_name}</p>
              {part.vendor_part_number && (
                <p className="text-xs text-gray-400 font-mono">{part.vendor_part_number}</p>
              )}
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-gray-400">Needed: <span className="text-white">{requirement.qty_needed}</span></span>
                <span className="text-gray-400">Allocated: <span className="text-blue-400">{requirement.qty_allocated || 0}</span></span>
                <span className="text-gray-400">Still Need: <span className="text-red-400">{stillNeeded}</span></span>
              </div>
            </CardContent>
          </Card>

          {/* Available Inventory */}
          <div>
            <Label className="text-gray-300 mb-2 block">Available Inventory</Label>
            
            {inventoryItems.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No inventory available for this part</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {inventoryItems.map(item => {
                  const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
                  const isLow = available < stillNeeded;

                  return (
                    <Card key={item.id} className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-3 h-3 text-gray-500" />
                              <span className="text-gray-300">{getLocationName(item.location_id)}</span>
                            </div>
                            <div className="flex gap-3 mt-1 text-xs">
                              <span className="text-gray-500">On Hand: {item.quantity_on_hand || 0}</span>
                              <span className="text-yellow-500">Reserved: {item.quantity_reserved || 0}</span>
                              <Badge className={available > 0 ? 'bg-green-600' : 'bg-red-600'}>
                                Available: {available}
                              </Badge>
                            </div>
                            {item.purchase_cost && (
                              <p className="text-xs text-gray-500 mt-1">Cost: ${item.purchase_cost.toFixed(2)}/ea</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isLow && available > 0 && (
                              <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            )}
                            <Input
                              type="number"
                              min="0"
                              max={available}
                              value={allocations[item.id] || ''}
                              onChange={(e) => {
                                const val = Math.min(Number(e.target.value) || 0, available);
                                setAllocations({...allocations, [item.id]: val});
                              }}
                              placeholder="0"
                              className="w-20 bg-gray-700 border-gray-600 text-center"
                              disabled={available <= 0}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary */}
          {totalSelected > 0 && (
            <div className="p-3 bg-blue-900/20 border border-blue-900/30 rounded-lg">
              <p className="text-sm text-blue-300">
                Allocating <span className="font-bold">{totalSelected}</span> unit(s) to this project
                {totalSelected >= stillNeeded && (
                  <span className="text-green-400 ml-2">✓ Fully allocated</span>
                )}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={handleAllocate}
              className="bg-red-600 hover:bg-red-700"
              disabled={allocateMutation.isPending || totalSelected === 0}
            >
              {allocateMutation.isPending ? 'Allocating...' : `Allocate ${totalSelected} Unit(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}