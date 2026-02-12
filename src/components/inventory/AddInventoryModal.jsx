import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import LocationSelect from "@/components/common/LocationSelect";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import { MobilePrimaryActionStack } from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";

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
    if (preselectedPart?.default_cost && !formData.purchase_cost) {
      setFormData(prev => ({
        ...prev,
        purchase_cost: preselectedPart.default_cost.toString()
      }));
    }
  }, [preselectedPart]);

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });



  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.InventoryItem.create({
      ...data,
      quantity_on_hand: Number(data.quantity_on_hand) || 0,
      quantity_reserved: 0,
      purchase_cost: data.purchase_cost ? Number(data.purchase_cost) : null,
      received_date: new Date().toISOString().split('T')[0]
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Inventory added successfully');
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
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}