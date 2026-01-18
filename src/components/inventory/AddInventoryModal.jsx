import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function AddInventoryModal({ onClose, preselectedPartId }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    part_id: preselectedPartId || '',
    location_id: '',
    quantity_on_hand: 1,
    purchase_cost: '',
    lot_number: '',
    notes: ''
  });

  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list()
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
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

  const parentLocations = locations.filter(l => !l.parent_id && l.active);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Add Inventory</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-300">Part *</Label>
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
          </div>

          <div>
            <Label className="text-gray-300">Location</Label>
            <Select 
              value={formData.location_id} 
              onValueChange={(v) => setFormData({...formData, location_id: v})}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent>
                {parentLocations.map(parent => {
                  const children = locations.filter(l => l.parent_id === parent.id && l.active);
                  return (
                    <React.Fragment key={parent.id}>
                      <SelectItem value={parent.id}>
                        <span style={{ color: parent.color }}>{parent.location_area}</span>
                      </SelectItem>
                      {children.map(child => (
                        <SelectItem key={child.id} value={child.id}>
                          <span className="ml-4" style={{ color: child.color }}>
                            → {child.location_area}
                          </span>
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  );
                })}
              </SelectContent>
            </Select>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}