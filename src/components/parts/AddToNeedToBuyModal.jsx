import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Loader2, Package } from "lucide-react";
import { toast } from "sonner";

/**
 * CANONICAL SUPPLY FLOW ENFORCED
 * All project part mutations must go through CommitmentService.
 * Direct entity writes are blocked.
 * 
 * AddToNeedToBuyModal - Creates a general (non-project) part requirement
 * for the "General / AK Stock" purchasing list
 * 
 * ⚠️ EXCEPTION: This modal creates PartProjectRequirement with project_id=null
 * This is ALLOWED because general stock requirements are outside the commitment system.
 * For project-linked parts, use AddToBuildModal which routes through CommitmentService.
 */
export default function AddToNeedToBuyModal({ part, onClose }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [priority, setPriority] = useState('Normal');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create a PartProjectRequirement with NO project_id (general/AK stock)
      await base44.entities.PartProjectRequirement.create({
        part_id: part.id,
        project_id: null, // No project = General AK
        qty_needed: quantity,
        qty_allocated: 0,
        qty_ordered: 0,
        qty_installed: 0,
        status: 'Needed',
        priority,
        notes: notes || `General stock request for ${part.part_name}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      toast.success(`Added ${quantity} × ${part.part_name} to AK Stock List`);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to add: ' + error.message);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (quantity < 1) {
      toast.error('Quantity must be at least 1');
      return;
    }
    createMutation.mutate();
  };

  const estimatedCost = quantity * (part.default_cost || 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ShoppingCart className="w-5 h-5 text-yellow-400" />
            Add to AK Stock List
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Part Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-3">
              {part.featured_photo ? (
                <img 
                  src={part.featured_photo} 
                  alt="" 
                  className="w-12 h-12 rounded object-contain bg-gray-800"
                />
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
                {part.default_cost > 0 && (
                  <p className="text-xs text-yellow-400">${part.default_cost.toFixed(2)} each</p>
                )}
              </div>
            </div>
          </div>

          {/* Destination Info */}
          <div className="p-3 bg-yellow-900/20 border border-yellow-900/30 rounded-lg">
            <p className="text-sm text-yellow-400">
              This will add to <strong>General / AK Stock</strong> in Need To Buy → Client Parts
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Not tied to any specific client project - for general shop stock
            </p>
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-gray-300">Quantity *</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          {/* Priority */}
          <div>
            <Label className="text-gray-300">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-300">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for ordering, usage notes..."
              className="bg-gray-800 border-gray-700 text-white"
              rows={2}
            />
          </div>

          {/* Estimated Cost */}
          {estimatedCost > 0 && (
            <div className="flex justify-between items-center p-2 bg-gray-800/50 rounded border border-gray-700">
              <span className="text-sm text-gray-400">Estimated Cost</span>
              <span className="text-lg font-bold text-yellow-400">${estimatedCost.toFixed(2)}</span>
            </div>
          )}
        </form>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ShoppingCart className="w-4 h-4 mr-2" />
            )}
            Add to AK Stock List
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}