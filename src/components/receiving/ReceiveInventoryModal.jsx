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
import { Package, MapPin, AlertTriangle, Plus } from "lucide-react";

/**
 * Enhanced Receiving Modal with mandatory location selection and provenance tracking
 */
export default function ReceiveInventoryModal({ 
  open, 
  onOpenChange, 
  part = null,
  receiptId = null,
  orderId = null,
  defaultQuantity = 1,
  defaultUnitCost = null 
}) {
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

  const createInventoryMutation = useMutation({
    mutationFn: async (data) => {
      return base44.entities.InventoryItem.create({
        part_id: part.id,
        location_id: data.location_id || null,
        quantity_on_hand: data.quantity,
        quantity_reserved: 0,
        purchase_cost: data.purchase_cost,
        purchase_order_id: orderId || null,
        received_date: format(new Date(), "yyyy-MM-dd"),
        lot_number: data.lot_number || null,
        notes: data.notes || null,
        receipt_id: receiptId || null,
        source_type: data.source_type,
        requires_inspection: data.requires_inspection,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success(`${formData.quantity} units added to inventory`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to add inventory: " + error.message);
    }
  });

  const handleSubmit = () => {
    if (!formData.location_id && !showLocationWarning) {
      setShowLocationWarning(true);
      return;
    }
    createInventoryMutation.mutate(formData);
  };

  const handleConfirmWithoutLocation = () => {
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
                <p className="text-white font-medium truncate">{part.part_name}</p>
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
            disabled={createInventoryMutation.isPending || !formData.quantity}
            className="bg-green-600 hover:bg-green-700"
          >
            {createInventoryMutation.isPending ? "Adding..." : "Add to Inventory"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}