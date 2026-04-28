import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
import { useSupplyAction } from "@/components/supply/useProjectSupplyView";
import { forceAppRefresh, extractRefreshContext } from "@/components/supply/forceAppRefresh";

/**
 * ReceiveInventoryModal - PHASE 12R CONTROLLED HYBRID
 * 
 * DUAL MODE (EXPLICIT):
 * 
 * Mode 1: "Receive Against PO / Commitment" (default if commitment context exists)
 *   - Routes through executeSupplyAction(RECEIVE)
 *   - Requires commitment_id (or PO line → commitment)
 *   - Updates covered_from_po → reserved_from_stock → physical_stock
 *   - Triggers auto-rebalance of reservations
 * 
 * Mode 2: "Add General Stock" (fallback for non-PO inventory)
 *   - Routes through executeSupplyAction(ADD_STOCK)
 *   - Requires part_id + qty + location_id
 *   - Directly increases physical_stock
 *   - Triggers auto-rebalance to allocate to open needs
 * 
 * CANONICAL: Both modes route through executeSupplyAction
 * NO direct Part.update allowed
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
  // PHASE 14E: showLocationWarning removed - backend handles UNASSIGNED_SYSTEM default
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

  // Use canonical supply action dispatcher for commitment-based receiving
  const supplyAction = useSupplyAction({
    showSuccessToast: false, // We handle toast manually
    onSuccess: (result) => {
      console.log("[ReceiveInventoryModal] supplyAction.onSuccess", result);
      setShowConfirmModal(false);
      toast.success(`${formData.quantity} units received successfully`);
      if (onSuccess) {
        try {
          onSuccess(result);
        } catch (err) {
          console.error("[ReceiveInventoryModal] onSuccess callback error:", err);
        }
      }
      handleClose();
    }
  });

  // Mode 2: ADD_STOCK for general inventory (non-PO)
  // Phase 12R: Routes through executeSupplyAction(ADD_STOCK)
  const addStockMutation = useMutation({
    mutationFn: async (data) => {
      if (!part?.id) throw new Error('Part ID required');
      
      const qty = Number(data.quantity) || 0;
      if (qty <= 0) throw new Error('Quantity must be positive');
      
      // CANONICAL: Route through dispatcher - triggers rebalance
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADD_STOCK',
        commitment_ids: [],
        payload: {
          part_id: part.id,
          qty,
          location_id: data.location_id || null,
          note: data.notes || null,
          purchase_cost: data.purchase_cost ? Number(data.purchase_cost) : null
        },
        dry_run: false
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to add stock');
      }
      
      return response.data;
    },
    onSuccess: async (result) => {
      console.log("[ReceiveInventoryModal] addStockMutation.onSuccess", result);
      
      // PHASE 17: Deterministic refresh
      try {
        const context = extractRefreshContext(result, { part_id: result?.part_id || part?.id });
        await forceAppRefresh(queryClient, context);
      } catch (refreshErr) {
        console.error("[ReceiveInventoryModal] Refresh error (non-fatal):", refreshErr);
      }
      
      toast.success(`${formData.quantity} units added to inventory (auto-allocated to open needs)`);
      setShowConfirmModal(false);
      
      if (onSuccess) {
        try {
          onSuccess(result);
        } catch (err) {
          console.error("[ReceiveInventoryModal] onSuccess callback error:", err);
        }
      }
      handleClose();
    },
    onError: (error) => {
      console.error("[ReceiveInventoryModal] addStockMutation.onError", error);
      toast.error("Failed to add inventory: " + (error?.message || "Unknown error"));
      setShowConfirmModal(false);
    }
  });
  
  // HARD GUARD (after hooks): If commitment is provided, it must be canonical
  if (commitment && commitment.required_total === undefined) {
    console.warn('[ModalGuard] Invalid commitment passed to ReceiveInventoryModal', commitment);
    return null;
  }

  const isReceiving = supplyAction.isPending || addStockMutation.isPending;

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
    
    // PHASE 14E: No location warning needed - backend routes to UNASSIGNED_SYSTEM
    // Show confirmation modal directly
    setShowConfirmModal(true);
  };
  
  const handleConfirmedReceive = async () => {
    // PHASE: CRASH-PROOF INSTRUMENTATION
    const orderLineItemIds = commitment?.order_line_item_ids ?? commitment?._raw?.order_line_item_ids ?? [];
    const debugPayload = {
      timestamp: new Date().toISOString(),
      mode: commitment && orderLineItemIds[0] ? 'RECEIVE_PO' : 'ADD_STOCK',
      part_id: part?.id,
      part_name: part?.part_name,
      commitment_id: commitment?.id,
      commitment_keys: commitment ? Object.keys(commitment) : [],
      order_line_item_ids: orderLineItemIds,
      order_line_item_id: orderLineItemIds[0],
      qty: formData.quantity,
      location_id: formData.location_id,
      hasCommitment: !!commitment,
    };
    
    console.log("RECEIVE_SUBMIT_START", debugPayload);
    window.__lastReceiveDebug = debugPayload;
    
    // PHASE: VALIDATION - Block invalid submissions
    const qty = Number(formData.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      console.error("RECEIVE_SUBMIT_BLOCKED: Invalid quantity", { qty, raw: formData.quantity });
      toast.error("Quantity must be a positive number");
      setShowConfirmModal(false);
      return;
    }
    
    if (!part?.id) {
      console.error("RECEIVE_SUBMIT_BLOCKED: Missing part_id", { part });
      toast.error("Part information is missing");
      setShowConfirmModal(false);
      return;
    }
    
    // Phase 12R: EXPLICIT MODE ROUTING
    try {
      // Mode 1: Receive Against PO/Commitment (commitment context exists with line item)
      if (commitment && orderLineItemIds[0]) {
        if (!commitment.id) {
          console.error("RECEIVE_SUBMIT_BLOCKED: Missing commitment_id", { commitment });
          toast.error("Commitment information is missing");
          setShowConfirmModal(false);
          return;
        }
        
        const payload = {
          action_type: 'RECEIVE',
          commitment_ids: [commitment.id],
          payload: {
            line_item_id: orderLineItemIds[0],
            qty_received: qty,
            location_id: formData.location_id || null
          },
          dry_run: false
        };
        
        console.log("RECEIVE_SUBMIT_PAYLOAD", payload);
        window.__lastReceiveDebug.payload = payload;
        
        supplyAction.mutate(payload, {
          onSuccess: (res) => {
            console.log("RECEIVE_SUBMIT_OK", res);
          },
          onError: (err) => {
            console.error("RECEIVE_SUBMIT_ERR", err);
            toast.error(err?.message || "Receive failed");
            setShowConfirmModal(false);
          }
        });
      } 
      // Mode 2: Add General Stock (no PO line item - either no commitment or commitment without PO)
      else {
        console.log("ADD_STOCK_PAYLOAD", { ...formData, quantity: qty });
        window.__lastReceiveDebug.payload = { ...formData, quantity: qty };
        
        addStockMutation.mutate({ ...formData, quantity: qty });
      }
    } catch (err) {
      console.error("RECEIVE_SUBMIT_EXCEPTION", err);
      toast.error(err?.message || "Receive failed unexpectedly");
      setShowConfirmModal(false);
    }
  };

  const activeLocations = locations.filter(l => l.active);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-green-500" />
            {commitment ? 'Receive Against PO' : 'Add General Stock'}
          </DialogTitle>
          <DialogDescription>
            {commitment 
              ? 'Receiving from purchase order (will auto-allocate to open needs).'
              : 'General stock intake (will auto-allocate to open commitments by priority).'}
          </DialogDescription>
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

        {/* PHASE 14E: Location warning removed - backend auto-routes to UNASSIGNED_SYSTEM */}
        {/* No need to warn users - inventory is always tracked */}

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
            <p className="text-xs text-gray-500 mt-1">
              If no location is selected, inventory will be assigned to "Unassigned" automatically.
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
          <Button variant="outline" onClick={handleClose} className="border-gray-700">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isReceiving || !formData.quantity || part?.is_archived}
            className="bg-green-600 hover:bg-green-700"
          >
            {isReceiving ? "Adding..." : "Add to Inventory"}
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
        isLoading={isReceiving}
      />
    </Dialog>
  );
}