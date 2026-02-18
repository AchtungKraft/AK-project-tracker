import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { format } from "date-fns";
import { Package, MapPin, AlertTriangle, Plus, Archive } from "lucide-react";
import ConfirmInventoryActionModal from "@/components/inventory/ConfirmInventoryActionModal";
import { PartTypeBadge } from "@/components/parts/PartTypeSelector";

/**
 * Enhanced Receiving Modal with mandatory location selection and provenance tracking
 * 
 * UNIFIED SUPPLY EXECUTION ENGINE:
 * When commitment is provided, routes through applyReceivingToOrderAndCommitment
 * to ensure lifecycle events and invariants are properly maintained.
 */
export default function ReceiveInventoryModal({ 
  open, 
  onOpenChange, 
  part = null,
  receiptId = null,
  orderId = null,
  defaultQuantity = 1,
  defaultUnitCost = null,
  // NEW: Unified engine props
  commitment = null,
  onSuccess = null,
  onClose = null
}) {
  // Support both open/onOpenChange and onClose patterns
  const handleClose = () => {
    if (onClose) onClose();
    if (onOpenChange) onOpenChange(false);
  };
  
  const isOpen = open !== undefined ? open : true;
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    quantity: defaultQuantity,
    location_id: "",
    purchase_cost: defaultUnitCost || part?.default_cost || 0,
    lot_number: "",
    notes: "",
    source_type: orderId ? "vendor_order" : "manual_entry",
    requires_inspection: false,
  });
  const [showLocationWarning, setShowLocationWarning] = useState(false);
  const [showCreateLocation, setShowCreateLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list(),
  });

  const createLocationMutation = useMutation({
    mutationFn: (name) => base44.entities.Location.create({
      location_area: name,
      active: true
    }),
    onSuccess: (newLocation) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setFormData(prev => ({ ...prev, location_id: newLocation.id }));
      setShowCreateLocation(false);
      setNewLocationName("");
      toast.success(`Location "${newLocation.location_area}" created`);
    }
  });

  // Use UNIFIED SUPPLY EXECUTION ENGINE when commitment is provided
  const createInventoryMutation = useMutation({
    mutationFn: async (data) => {
      // If commitment provided, use unified engine for lifecycle + invariant enforcement
      if (commitment) {
        const response = await base44.functions.invoke('applyReceivingToOrderAndCommitment', {
          commitment_id: commitment.id,
          part_id: part.id,
          order_id: orderId || null,
          line_item_id: commitment.order_line_item_ids?.[0] || null,
          qty_received: data.quantity,
          location_id: data.location_id || null,
          unit_cost: data.purchase_cost,
          lot_number: data.lot_number || null,
          notes: data.notes || null,
          source_type: data.source_type,
          requires_inspection: data.requires_inspection,
        });
        
        if (response.data?.error) {
          throw new Error(response.data.error);
        }
        
        return response.data;
      }
      
      // Legacy path for non-commitment receiving (general inventory)
      const response = await base44.functions.invoke('mutateInventory', {
        mutation_type: 'receive',
        part_id: part.id,
        qty: data.quantity,
        to_location_id: data.location_id || null,
        unit_cost: data.purchase_cost,
        order_id: orderId || null,
        line_item_id: null,
        lot_number: data.lot_number || null,
        notes: data.notes || null,
        source_type: data.source_type,
        requires_inspection: data.requires_inspection,
      });
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      return response.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryAuditLogs'] });
      
      // Additional invalidations for commitment-linked receiving
      if (commitment) {
        queryClient.invalidateQueries({ queryKey: ['projectCommitments'] });
        queryClient.invalidateQueries({ queryKey: ['projectLineItems'] });
        queryClient.invalidateQueries({ queryKey: ['partPurchaseLineItems'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
      
      toast.success(`${formData.quantity} units added to inventory`);
      setShowConfirmModal(false);
      
      // Call onSuccess callback if provided
      if (onSuccess) onSuccess(result);
      
      handleClose();
    },
    onError: (error) => {
      toast.error("Failed to add inventory: " + error.message);
    }
  });

  const handleSubmit = () => {
    // Check if part is archived
    if (part?.is_archived) {
      toast.error("Cannot receive inventory for archived parts");
      return;
    }
    
    // Check if CLIENT_SUPPLIED receiving from vendor
    if (part?.part_type === 'CLIENT_SUPPLIED' && formData.source_type === 'vendor_order') {
      toast.error("Client-supplied parts cannot be received from vendor orders");
      return;
    }
    
    if (!formData.location_id && !showLocationWarning) {
      setShowLocationWarning(true);
      return;
    }
    
    // Show confirmation modal
    setShowConfirmModal(true);
  };

  const handleConfirmWithoutLocation = () => {
    setShowConfirmModal(true);
  };
  
  const handleConfirmedReceive = () => {
    createInventoryMutation.mutate(formData);
  };

  const activeLocations = locations.filter(l => l.active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-green-500" />
            Receive Inventory
          </DialogTitle>
        </DialogHeader>

        {/* Archived Warning */}
        {part?.is_archived && (
          <Alert className="bg-red-900/30 border-red-600">
            <Archive className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-200">
              <strong>This part is archived.</strong> You cannot receive inventory for archived parts.
            </AlertDescription>
          </Alert>
        )}

        {/* Part Info */}
        {part && (
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              {part.featured_photo ? (
                <img src={part.featured_photo} alt="" className="w-12 h-12 rounded object-contain bg-gray-800" />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center">
                  <Package className="w-6 h-6 text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium truncate">{part.part_name}</p>
                  {part.part_type && <PartTypeBadge partType={part.part_type} size="sm" />}
                </div>
                {part.vendor_part_number && (
                  <p className="text-xs text-gray-400 font-mono">{part.vendor_part_number}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Location Warning */}
        {showLocationWarning && !formData.location_id && (
          <Alert className="bg-yellow-900/30 border-yellow-600">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-200">
              <strong>No location selected!</strong> Inventory without a location is harder to find and track. 
              Are you sure you want to continue?
              <div className="flex gap-2 mt-3">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowLocationWarning(false)}
                  className="border-gray-600"
                >
                  Go Back
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleConfirmWithoutLocation}
                  className="bg-yellow-600 hover:bg-yellow-700"
                  disabled={createInventoryMutation.isPending}
                >
                  Continue Without Location
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {/* Quantity */}
          <div>
            <Label className="text-gray-300">Quantity *</Label>
            <Input
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
              className="bg-gray-800 border-gray-700"
            />
          </div>

          {/* Location Selection */}
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Storage Location
            </Label>
            {showCreateLocation ? (
              <div className="flex gap-2 mt-1">
                <Input
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="New location name..."
                  className="bg-gray-800 border-gray-700"
                />
                <Button
                  onClick={() => createLocationMutation.mutate(newLocationName)}
                  disabled={!newLocationName || createLocationMutation.isPending}
                  size="sm"
                >
                  Create
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateLocation(false)}
                  size="sm"
                  className="border-gray-700"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 mt-1">
                <Select
                  value={formData.location_id}
                  onValueChange={(v) => {
                    setFormData(prev => ({ ...prev, location_id: v }));
                    setShowLocationWarning(false);
                  }}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 flex-1">
                    <SelectValue placeholder="Select location..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>No Location</SelectItem>
                    {activeLocations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.location_area} {loc.bin_description ? `- ${loc.bin_description}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => setShowCreateLocation(true)}
                  className="border-gray-700"
                  title="Create new location"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-yellow-500 mt-1">
              Assigning a location is strongly recommended for tracking
            </p>
          </div>

          {/* Source Type */}
          <div>
            <Label className="text-gray-300">Source Type</Label>
            <Select
              value={formData.source_type}
              onValueChange={(v) => setFormData(prev => ({ ...prev, source_type: v }))}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendor_order">Vendor Order</SelectItem>
                <SelectItem value="manual_entry">Manual Entry</SelectItem>
                <SelectItem value="internal_transfer">Internal Transfer</SelectItem>
                <SelectItem value="material_conversion">Material Conversion</SelectItem>
                <SelectItem value="client_supplied">Client Supplied</SelectItem>
                <SelectItem value="vehicle_removed">Vehicle Removed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Unit Cost */}
          <div>
            <Label className="text-gray-300">Unit Cost</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.purchase_cost}
              onChange={(e) => setFormData(prev => ({ ...prev, purchase_cost: parseFloat(e.target.value) || 0 }))}
              className="bg-gray-800 border-gray-700"
            />
          </div>

          {/* Lot Number */}
          <div>
            <Label className="text-gray-300">Lot/Batch Number (Optional)</Label>
            <Input
              value={formData.lot_number}
              onChange={(e) => setFormData(prev => ({ ...prev, lot_number: e.target.value }))}
              placeholder="Batch or lot identifier..."
              className="bg-gray-800 border-gray-700"
            />
          </div>

          {/* Requires Inspection */}
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div>
              <Label className="text-gray-300">Requires Inspection?</Label>
              <p className="text-xs text-gray-500">Flag if this inventory needs inspection before use</p>
            </div>
            <Switch
              checked={formData.requires_inspection}
              onCheckedChange={(v) => setFormData(prev => ({ ...prev, requires_inspection: v }))}
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any notes about this inventory..."
              className="bg-gray-800 border-gray-700"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-700">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createInventoryMutation.isPending || !formData.quantity || part?.is_archived}
            className="bg-green-600 hover:bg-green-700"
          >
            {createInventoryMutation.isPending ? "Adding..." : "Add to Inventory"}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Confirmation Modal */}
      <ConfirmInventoryActionModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmedReceive}
        actionType="receive"
        part={part}
        quantity={formData.quantity}
        toLocation={activeLocations.find(l => l.id === formData.location_id)}
        isLoading={createInventoryMutation.isPending}
      />
    </Dialog>
  );
}