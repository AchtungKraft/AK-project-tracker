import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { cn } from "@/lib/utils";
import { ArrowRight, Package, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const TRANSFER_REASONS = [
  { value: "restock", label: "Restock" },
  { value: "project_staging", label: "Project Staging" },
  { value: "consolidation", label: "Consolidation" },
  { value: "correction", label: "Correction" },
  { value: "return_to_stock", label: "Return to Stock" },
  { value: "other", label: "Other" },
];

/**
 * InventoryMoveModal
 * Modal for transferring inventory between locations
 */
export default function InventoryMoveModal({
  isOpen,
  onClose,
  part,
  inventoryItem,
  currentLocationId,
  maxQuantity,
  onSuccess,
}) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    toLocationId: "",
    quantity: 1,
    reason: "other",
    notes: "",
  });

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => base44.entities.Location.list(),
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        toLocationId: "",
        quantity: Math.min(1, maxQuantity || 1),
        reason: "other",
        notes: "",
      });
    }
  }, [isOpen, maxQuantity]);

  // Create transfer mutation using centralized service
  const transferMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('mutateInventory', {
        mutation_type: 'move',
        part_id: part?.id,
        qty: data.quantity,
        from_location_id: currentLocationId,
        to_location_id: data.toLocationId,
        inventory_item_id: inventoryItem?.id,
        reason: data.reason,
        notes: data.notes,
      });
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryTransfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryAuditLogs"] });
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      // Error is handled by the mutation service
      console.error('Transfer failed:', error);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.toLocationId || formData.quantity < 1) return;
    transferMutation.mutate(formData);
  };

  const availableLocations = locations.filter((loc) => loc.id !== currentLocationId);
  const currentLocation = locations.find((loc) => loc.id === currentLocationId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "bg-gray-900 border-gray-700 max-w-md",
          isMobile && "fixed bottom-0 left-0 right-0 top-auto translate-y-0 rounded-t-2xl rounded-b-none max-w-full mx-0"
        )}
        style={isMobile ? { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ArrowRight className="w-5 h-5" />
            Move Inventory
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Transfer inventory to a different location.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Part Info */}
          {part && (
            <div className="bg-gray-800/50 rounded-lg p-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-white font-medium">{part.part_name}</span>
            </div>
          )}

          {/* Current Location */}
          <div className="space-y-2">
            <Label className="text-gray-300">From Location</Label>
            <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-white">{currentLocation?.name || "Unknown"}</span>
              <span className="text-gray-400 ml-auto">Available: {maxQuantity}</span>
            </div>
          </div>

          {/* Destination Location */}
          <div className="space-y-2">
            <Label className="text-gray-300">To Location *</Label>
            <Select
              value={formData.toLocationId}
              onValueChange={(value) => setFormData({ ...formData, toLocationId: value })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select destination..." />
              </SelectTrigger>
              <SelectContent>
                {availableLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label className="text-gray-300">Quantity *</Label>
            <Input
              type="number"
              min={1}
              max={maxQuantity}
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-gray-300">Reason</Label>
            <Select
              value={formData.reason}
              onValueChange={(value) => setFormData({ ...formData, reason: value })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFER_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes..."
              className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
            />
          </div>
        </form>

        <DialogFooter className={cn(isMobile && "flex-col-reverse gap-2")}>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={transferMutation.isPending}
            className={cn("border-gray-700", isMobile && "w-full h-11")}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={transferMutation.isPending || !formData.toLocationId || formData.quantity < 1}
            className={cn("bg-blue-600 hover:bg-blue-700 text-white", isMobile && "w-full h-11")}
          >
            {transferMutation.isPending ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}