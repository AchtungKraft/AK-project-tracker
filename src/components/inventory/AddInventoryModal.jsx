import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import LocationSelect from "@/components/common/LocationSelect";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { forceAppRefresh, extractRefreshContext } from "@/components/supply/forceAppRefresh";

/**
 * AddInventoryModal - Add inventory for a part
 * 
 * CANONICAL: Routes through executeSupplyAction ADD_STOCK
 * No direct Part.physical_stock writes - all inventory mutations go through dispatcher
 * Uses unified invalidation helper
 */
export default function AddInventoryModal({ onClose, preselectedPartId }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  // Get default cost from part if preselected
  const { data: preselectedPart } = useQuery({
    queryKey: ['part', preselectedPartId],
    queryFn: async () => {
      if (!preselectedPartId) return null;
      const allParts = await base44.entities.Part.list();
      return allParts.find(p => p.id === preselectedPartId);
    },
    enabled: !!preselectedPartId,
  });

  const [formData, setFormData] = useState({
    part_id: preselectedPartId || '',
    location_id: '',
    quantity_on_hand: 1,
    purchase_cost: '',
    lot_number: '',
    notes: ''
  });

  // Update default cost when part data loads
  React.useEffect(() => {
    if (preselectedPart?.cost && !formData.purchase_cost) {
      setFormData(prev => ({
        ...prev,
        purchase_cost: preselectedPart.cost.toString()
      }));
    }
  }, [preselectedPart]);

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const qty = Number(data.quantity_on_hand) || 0;
      const partId = data.part_id;

      if (!partId) throw new Error('Part is required');
      if (qty <= 0) throw new Error('Quantity must be positive');

      // PHASE 14E: location_id is NEVER null - backend enforces UNASSIGNED_SYSTEM
      // Frontend passes location_id: data.location_id || null, backend handles default
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADD_STOCK',
        payload: {
          part_id: partId,
          qty,
          location_id: data.location_id || null, // Backend will default to UNASSIGNED_SYSTEM
          note: data.notes || null,
          purchase_cost: data.purchase_cost ? Number(data.purchase_cost) : null
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to add inventory');
      }

      return response.data;
    },
    onSuccess: async (result) => {
      // PHASE 17: Deterministic refresh
      const context = extractRefreshContext(result, { part_id: result.part_id });
      await forceAppRefresh(queryClient, context);
      
      toast.success(`Added ${result.qty_added} to inventory (new total: ${result.new_physical_stock})`);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to add inventory: ' + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.part_id) {
      toast.error('Please select a part');
      return;
    }
    createMutation.mutate(formData);
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-300">Part *</Label>
            {preselectedPartId ? (
              <div className="p-2 bg-gray-800 border border-gray-700 rounded-md">
                <p className="text-white text-sm">{preselectedPart?.part_name || 'Loading...'}</p>
                {preselectedPart?.vendor_part_number && (
                  <p className="text-xs text-gray-400 font-mono">{preselectedPart.vendor_part_number}</p>
                )}
              </div>
            ) : (
              <Select 
                value={formData.part_id} 
                onValueChange={(v) => setFormData({...formData, part_id: v})}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue placeholder="Select part..." />
                </SelectTrigger>
                <SelectContent>
                  {parts.map(part => (
                    <SelectItem key={part.id} value={part.id}>
                      {part.part_name}
                      {part.vendor_part_number && ` (${part.vendor_part_number})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label className="text-gray-300">Location</Label>
            <LocationSelect
              value={formData.location_id}
              onValueChange={(v) => setFormData({...formData, location_id: v})}
              className="bg-gray-800 border-gray-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300">Quantity *</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={formData.quantity_on_hand}
                onChange={(e) => setFormData({...formData, quantity_on_hand: e.target.value})}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div>
              <Label className="text-gray-300">Unit Cost</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formData.purchase_cost}
                onChange={(e) => setFormData({...formData, purchase_cost: e.target.value})}
                className="bg-gray-800 border-gray-700"
              />
            </div>
          </div>

          <div>
            <Label className="text-gray-300">Lot/Batch Number</Label>
            <Input
              value={formData.lot_number}
              onChange={(e) => setFormData({...formData, lot_number: e.target.value})}
              placeholder="Optional batch identifier"
              className="bg-gray-800 border-gray-700"
            />
          </div>

          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Optional notes..."
              className="bg-gray-800 border-gray-700 h-20"
            />
          </div>

          {!isMobile && (
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-red-600 hover:bg-red-700"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Adding...' : 'Add Inventory'}
              </Button>
            </div>
          )}
        </form>
  );

  const mobileFooter = (
    <MobilePrimaryActionStack
      primaryAction={{
        label: createMutation.isPending ? 'Adding...' : 'Add Inventory',
        onClick: handleSubmit,
        disabled: createMutation.isPending,
        loading: createMutation.isPending,
      }}
      secondaryActions={[
        { label: 'Cancel', onClick: onClose, variant: 'outline' }
      ]}
    />
  );

  if (isMobile) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="p-0 max-w-full h-full max-h-full bg-gray-900 border-red-900/30 text-white">
          <MobileModalWrapper
            title="Add Inventory"
            onClose={onClose}
            footer={mobileFooter}
          >
            {formContent}
          </MobileModalWrapper>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Add Inventory</DialogTitle>
          <DialogDescription>
            Add inventory stock for a part.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}