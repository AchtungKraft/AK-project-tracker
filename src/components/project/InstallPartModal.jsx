import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, Package, MapPin, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ConfirmInventoryActionModal from "@/components/inventory/ConfirmInventoryActionModal";
import { PartTypeBadge } from "@/components/parts/PartTypeSelector";
import { useSupplyAction, useCommitmentState } from "@/components/supply/useSupplyState";
import { CommitmentQuantityRow } from "@/components/supply/CanonicalQuantityDisplay";

/**
 * InstallPartModal - Install parts using canonical dispatcher
 * 
 * ALL MUTATIONS route through executeSupplyAction with action_type='INSTALL'
 * NO direct entity writes allowed
 */
export default function InstallPartModal({ requirement, commitment: passedCommitment, onClose }) {
  const queryClient = useQueryClient();
  
  // Determine if we're using requirement-based or commitment-based install
  const commitmentId = passedCommitment?.id || requirement?.commitment_id;
  
  // Fetch canonical commitment state from resolver
  const { data: commitmentState } = useCommitmentState(commitmentId);
  
  // Calculate max installable from canonical state
  const available_for_install = commitmentState?.available_for_install ?? 0;
  const maxInstallable = passedCommitment 
    ? available_for_install
    : (requirement?.qty_allocated || 0) - (requirement?.qty_installed || 0);
  
  const [qtyToInstall, setQtyToInstall] = useState(Math.min(maxInstallable, 1));
  const [notes, setNotes] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems', requirement?.part_id || passedCommitment?.part_id],
    queryFn: () => base44.entities.InventoryItem.filter({ part_id: requirement?.part_id || passedCommitment?.part_id }),
    enabled: !!(requirement?.part_id || passedCommitment?.part_id)
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  const partId = requirement?.part_id || passedCommitment?.part_id;
  const part = parts.find(p => p.id === partId) || {};
  const activeLocations = locations.filter(l => l.active);
  
  // Get available inventory with location info
  const availableInventory = inventoryItems
    .map(item => {
      const location = locations.find(l => l.id === item.location_id);
      const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
      return { ...item, location, available };
    })
    .filter(i => i.available > 0);
  
  // Check if part type affects inventory
  const affectsInventory = part.affects_inventory !== false;

  // Use canonical supply action dispatcher
  const supplyAction = useSupplyAction({
    onSuccess: () => {
      setShowConfirmModal(false);
      onClose();
    }
  });

  const handleInstall = () => {
    if (qtyToInstall <= 0 || qtyToInstall > maxInstallable) {
      toast.error('Invalid quantity');
      return;
    }
    
    // Validate location selection if part affects inventory
    if (affectsInventory && !selectedLocationId && availableInventory.length > 0) {
      toast.error('Please select a source location');
      return;
    }
    
    // Show confirmation modal
    setShowConfirmModal(true);
  };
  
  const handleConfirmedInstall = () => {
    // Route through canonical dispatcher - NO direct entity writes
    supplyAction.mutate({
      action_type: 'INSTALL',
      commitment_ids: [commitmentId],
      payload: {
        qty_to_install: qtyToInstall,
        location_id: selectedLocationId || null,
        notes: notes || `Installed for project`
      },
      dry_run: false
    });
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

          {/* Show canonical commitment state if available */}
          {commitmentState && (
            <CommitmentQuantityRow state={commitmentState} compact className="mb-2" />
          )}

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

              {/* Source Location Selection */}
              {affectsInventory && (
                <div>
                  <Label className="text-gray-300 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Source Location *
                  </Label>
                  {availableInventory.length === 0 ? (
                    <div className="bg-red-900/30 border border-red-600 rounded-lg p-3 flex items-center gap-2 mt-1">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-red-200 text-sm">No inventory available for this part</span>
                    </div>
                  ) : (
                    <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                        <SelectValue placeholder="Select inventory location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableInventory.map((inv) => (
                          <SelectItem key={inv.id} value={inv.location_id || inv.id}>
                            {inv.location?.name || inv.location?.location_area || 'Unassigned'} 
                            {' '}({inv.available} available)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

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
              disabled={supplyAction.isPending || maxInstallable <= 0 || (affectsInventory && availableInventory.length === 0)}
            >
              {supplyAction.isPending ? 'Installing...' : `Install ${qtyToInstall} Unit(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
      
      {/* Confirmation Modal */}
      <ConfirmInventoryActionModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmedInstall}
        actionType="install"
        part={part}
        quantity={qtyToInstall}
        fromLocation={activeLocations.find(l => l.id === selectedLocationId)}
        commitment={passedCommitment || commitmentState}
        isLoading={supplyAction.isPending}
      />
    </Dialog>
  );
}