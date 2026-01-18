import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, Package } from "lucide-react";
import { toast } from "sonner";

export default function InstallPartModal({ requirement, onClose }) {
  const queryClient = useQueryClient();
  const [qtyToInstall, setQtyToInstall] = useState(
    Math.min((requirement.qty_allocated || 0) - (requirement.qty_installed || 0), 1)
  );
  const [notes, setNotes] = useState('');

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems', requirement.part_id],
    queryFn: () => base44.entities.InventoryItem.filter({ part_id: requirement.part_id })
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['partCategories'],
    queryFn: () => base44.entities.PartCategory.list()
  });

  const part = parts.find(p => p.id === requirement.part_id) || {};
  const maxInstallable = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);

  const installMutation = useMutation({
    mutationFn: async () => {
      // Find reserved inventory to consume
      let remaining = qtyToInstall;
      const updates = [];
      
      for (const item of inventoryItems) {
        if (remaining <= 0) break;
        
        const reservedHere = Math.min(item.quantity_reserved || 0, remaining);
        if (reservedHere > 0) {
          // Reduce on_hand and reserved
          updates.push(
            base44.entities.InventoryItem.update(item.id, {
              quantity_on_hand: Math.max(0, (item.quantity_on_hand || 0) - reservedHere),
              quantity_reserved: Math.max(0, (item.quantity_reserved || 0) - reservedHere)
            })
          );
          
          // Create installed part record
          const unitCost = item.purchase_cost || part.default_cost || 0;
          updates.push(
            base44.entities.InstalledPart.create({
              part_id: requirement.part_id,
              project_id: requirement.project_id,
              requirement_id: requirement.id,
              inventory_item_id: item.id,
              qty_consumed: reservedHere,
              unit_cost_at_install: unitCost,
              extended_cost: reservedHere * unitCost,
              installed_date: new Date().toISOString(),
              category_id: part.part_category_id,
              notes: notes
            })
          );
          
          remaining -= reservedHere;
        }
      }

      // Update requirement
      const newInstalled = (requirement.qty_installed || 0) + qtyToInstall;
      const newStatus = newInstalled >= requirement.qty_needed ? 'Installed' : 
                       newInstalled > 0 ? 'Partially Installed' : requirement.status;
      
      updates.push(
        base44.entities.PartProjectRequirement.update(requirement.id, {
          qty_installed: newInstalled,
          status: newStatus
        })
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      queryClient.invalidateQueries({ queryKey: ['installedParts'] });
      toast.success(`${qtyToInstall} unit(s) marked as installed`);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to install: ' + error.message);
    }
  });

  const handleInstall = () => {
    if (qtyToInstall <= 0 || qtyToInstall > maxInstallable) {
      toast.error('Invalid quantity');
      return;
    }
    installMutation.mutate();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Install Part
          </DialogTitle>
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
                <span className="text-gray-400">Installed: <span className="text-green-400">{requirement.qty_installed || 0}</span></span>
              </div>
            </CardContent>
          </Card>

          {maxInstallable <= 0 ? (
            <div className="text-center py-6 text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No allocated units available to install</p>
              <p className="text-xs mt-1">Allocate inventory first</p>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-gray-300">Quantity to Install (max: {maxInstallable})</Label>
                <Input
                  type="number"
                  min="1"
                  max={maxInstallable}
                  value={qtyToInstall}
                  onChange={(e) => setQtyToInstall(Math.min(Number(e.target.value) || 1, maxInstallable))}
                  className="bg-gray-800 border-gray-700"
                />
              </div>

              <div>
                <Label className="text-gray-300">Installation Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes about the installation..."
                  className="bg-gray-800 border-gray-700 h-20"
                />
              </div>

              {/* Cost Preview */}
              {(() => {
                const avgCost = inventoryItems.length > 0 
                  ? inventoryItems.reduce((sum, i) => sum + (i.purchase_cost || part.default_cost || 0), 0) / inventoryItems.length
                  : (part.default_cost || 0);
                const estimatedCost = qtyToInstall * avgCost;
                
                return (
                  <div className="p-3 bg-green-900/20 border border-green-900/30 rounded-lg">
                    <p className="text-sm text-green-300">
                      Estimated cost to add to project: <span className="font-bold">${estimatedCost.toFixed(2)}</span>
                    </p>
                  </div>
                );
              })()}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              onClick={handleInstall}
              className="bg-green-600 hover:bg-green-700"
              disabled={installMutation.isPending || maxInstallable <= 0}
            >
              {installMutation.isPending ? 'Installing...' : `Install ${qtyToInstall} Unit(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}