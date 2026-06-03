import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import LocationSelect from "@/components/common/LocationSelect";
import MobileModalWrapper from "@/components/mobile/MobileModalWrapper";
import MobilePrimaryActionStack from "@/components/mobile/MobilePrimaryActionStack";
import { useIsMobile } from "@/components/mobile/useIsMobile";
import { extractRefreshContext } from "@/components/supply/forceAppRefresh";
import { refreshForAdjustStock } from "@/components/supply/tieredSupplyRefresh";

/**
 * Reason codes that are simple manual adjustments — no supply-chain side effects.
 * These get targeted refresh (≤8 requests) instead of full forceAppRefresh (~55).
 */
const MANUAL_REASONS = new Set([
  'correction',   // Count correction (add or remove)
  'shop_use',     // Shop use / non-project consume
  'damage',       // Damaged/defective
  'shrinkage',    // Shrinkage/loss
  'obsolete',     // Obsolete inventory
  'return',       // Customer return
]);

/**
 * Reason codes that affect supply chain (PO, reorder, commitments).
 * These still require full forceAppRefresh.
 */
// 'receiving' and 'reorder' are PO-linked — keep full refresh

/**
 * AdjustInventoryModal - Add or remove inventory for a part
 * 
 * CANONICAL: Routes through executeSupplyAction ADJUST_STOCK
 * Supports both additions and removals with reason codes
 * All inventory mutations through dispatcher
 * 
 * TIERED REFRESH:
 *   Manual reasons → targeted invalidation (≤8 requests)
 *   PO-linked reasons → full forceAppRefresh (supply chain consistency)
 */
export default function AdjustInventoryModal({ onClose, preselectedPartId }) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  
  // Get default cost from part if preselected — fetch single part, not entire list
  const { data: preselectedPart } = useQuery({
    queryKey: ['part', preselectedPartId],
    queryFn: async () => {
      if (!preselectedPartId) return null;
      const rows = await base44.entities.Part.filter({ id: preselectedPartId });
      return rows?.[0] ?? null;
    },
    enabled: !!preselectedPartId,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const [direction, setDirection] = useState('add');
  const [formData, setFormData] = useState({
    part_id: preselectedPartId || '',
    location_id: '',
    quantity: 1,
    purchase_cost: '',
    reason: '',
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

  // Only fetch full parts list if no part is preselected (for the selector dropdown)
  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: () => base44.entities.Part.list(),
    enabled: !preselectedPartId,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Reason options based on direction
  const reasonOptions = {
    add: [
      { value: 'receiving', label: 'Receiving' },
      { value: 'reorder', label: 'Reorder Receipt' },
      { value: 'correction', label: 'Count Correction (Add)' },
      { value: 'return', label: 'Customer Return' },
    ],
    remove: [
      { value: 'shop_use', label: 'Shop Use' },
      { value: 'damage', label: 'Damaged/Defective' },
      { value: 'correction', label: 'Count Correction (Remove)' },
      { value: 'shrinkage', label: 'Shrinkage/Loss' },
      { value: 'obsolete', label: 'Obsolete Inventory' },
    ]
  };

  const adjustMutation = useMutation({
    mutationFn: async (data) => {
      const qty = Number(data.quantity) || 0;
      const partId = data.part_id;

      if (!partId) throw new Error('Part is required');
      if (qty <= 0) throw new Error('Quantity must be positive');
      if (!data.reason) throw new Error('Reason is required');

      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADJUST_STOCK',
        payload: {
          part_id: partId,
          direction: direction,
          qty,
          location_id: data.location_id || null,
          reason: data.reason,
          notes: data.notes || null,
          purchase_cost: direction === 'add' && data.purchase_cost ? Number(data.purchase_cost) : null
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to adjust inventory');
      }

      return response.data;
    },
    onSuccess: async (result) => {
      const reason = formData.reason;
      const partId = formData.part_id;
      const isManual = MANUAL_REASONS.has(reason);
      
      // DEFENSIVE GUARD: Even if reason is non-manual, verify actual cross-domain
      // references exist before allowing full supply-chain refresh. If the backend
      // returned no project/PO/commitment references, downgrade to targeted.
      const hasCrossDomainRef = !!(
        result.project_id ||
        result.order_id ||
        result.commitment_id ||
        result.supply_action_id ||
        result.po_line_item_id
      );
      
      const useTargeted = isManual || !hasCrossDomainRef;
      
      if (useTargeted) {
        // TARGETED REFRESH — manual adjustments or no cross-domain references
        const invalidations = [
          queryClient.invalidateQueries({ queryKey: ['parts'] }),
          queryClient.invalidateQueries({ queryKey: ['partsInventoryView'] }),
          queryClient.invalidateQueries({ queryKey: ['part', partId] }),
          queryClient.invalidateQueries({ queryKey: ['partsInventoryView', partId] }),
          queryClient.invalidateQueries({ queryKey: ['inventoryLocations', partId] }),
          queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }),
          // Stock thresholds may change — refresh reorder views
          queryClient.invalidateQueries({ queryKey: ['stockCommitments'] }),
        ];
        await Promise.all(invalidations);
        
        if (import.meta.env.DEV) {
          const downgraded = !isManual && !hasCrossDomainRef;
          console.log(
            `[PartsPerf] AdjustInventory\n` +
            `  reason: ${reason}\n` +
            `  refreshMode: targeted${downgraded ? ' (downgraded — no cross-domain refs)' : ''}\n` +
            `  invalidations: ${invalidations.length}\n` +
            `  estimatedRequests: ≤${invalidations.length + 1}`
          );
        }
      } else {
        // TIERED REFRESH — PO-linked reasons use refreshForAdjustStock (≤20 requests)
        const context = extractRefreshContext(result, { part_id: partId });
        await refreshForAdjustStock(queryClient, context, result);
        
        if (import.meta.env.DEV) {
          const refs = [
            result.project_id && `project:${result.project_id}`,
            result.order_id && `order:${result.order_id}`,
            result.commitment_id && `commitment:${result.commitment_id}`,
          ].filter(Boolean).join(', ');
          console.log(
            `[PartsPerf] AdjustInventory\n` +
            `  reason: ${reason}\n` +
            `  refreshMode: tiered (refreshForAdjustStock)\n` +
            `  crossDomainRefs: ${refs}\n` +
            `  estimatedRequests: ≤20`
          );
        }
      }
      
      const action = direction === 'add' ? 'Added' : 'Removed';
      const qtyAdj = result.qty_adjusted ?? Number(formData.quantity);
      const newStock = result.new_physical_stock;
      toast.success(`${action} ${qtyAdj} units${newStock != null ? ` (new total: ${newStock})` : ''}`);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to adjust inventory: ' + error.message);
    }
  });

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!formData.part_id) {
      toast.error('Please select a part');
      return;
    }
    if (!formData.reason) {
      toast.error('Please select a reason');
      return;
    }
    const qty = Number(formData.quantity);
    if (!qty || qty <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }
    adjustMutation.mutate(formData);
  };

  const isRemovingStock = direction === 'remove';
  const currentStock = preselectedPart?.physical_stock || 0;
  const projectedStock = direction === 'add' 
    ? currentStock + Number(formData.quantity || 0)
    : currentStock - Number(formData.quantity || 0);

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Direction Toggle */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={direction === 'add' ? 'default' : 'outline'}
          className={direction === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
          onClick={() => { setDirection('add'); setFormData({...formData, reason: ''}); }}
        >
          Add
        </Button>
        <Button
          type="button"
          variant={direction === 'remove' ? 'default' : 'outline'}
          className={direction === 'remove' ? 'bg-red-600 hover:bg-red-700' : ''}
          onClick={() => { setDirection('remove'); setFormData({...formData, reason: ''}); }}
        >
          Remove
        </Button>
      </div>

      {/* Part Selection */}
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

      {/* Current Stock Preview */}
      {preselectedPart && (
        <div className="grid grid-cols-2 gap-2 text-xs p-2 bg-gray-800 rounded border border-gray-700">
          <div>
            <p className="text-gray-400">Current Stock</p>
            <p className="text-white font-bold">{currentStock}</p>
          </div>
          <div>
            <p className="text-gray-400">Projected Stock</p>
            <p className={projectedStock < 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
              {projectedStock}
            </p>
          </div>
        </div>
      )}

      {/* Negative Stock Warning */}
      {projectedStock < 0 && (
        <div className="flex gap-2 p-3 bg-red-900/20 border border-red-700/50 rounded text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>This adjustment would result in negative inventory.</p>
        </div>
      )}

      {/* Location */}
      <div>
        <Label className="text-gray-300">Location</Label>
        <LocationSelect
          value={formData.location_id}
          onValueChange={(v) => setFormData({...formData, location_id: v})}
          className="bg-gray-800 border-gray-700"
        />
      </div>

      {/* Quantity */}
      <div>
        <Label className="text-gray-300">Quantity *</Label>
        <Input
          type="number"
          min="1"
          step="1"
          value={formData.quantity}
          onChange={(e) => setFormData({...formData, quantity: e.target.value})}
          className="bg-gray-800 border-gray-700"
        />
      </div>

      {/* Reason */}
      <div>
        <Label className="text-gray-300">Reason *</Label>
        <Select 
          value={formData.reason} 
          onValueChange={(v) => setFormData({...formData, reason: v})}
        >
          <SelectTrigger className="bg-gray-800 border-gray-700">
            <SelectValue placeholder="Select reason..." />
          </SelectTrigger>
          <SelectContent>
            {reasonOptions[direction].map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Unit Cost (only for add) */}
      {direction === 'add' && (
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
      )}

      {/* Notes */}
      <div>
        <Label className="text-gray-300">Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          placeholder="Optional notes..."
          className="bg-gray-800 border-gray-700 h-16"
        />
      </div>

      {!isMobile && (
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
            Cancel
          </Button>
          <Button 
            type="submit" 
            className={direction === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
            disabled={adjustMutation.isPending}
          >
            {adjustMutation.isPending ? 'Adjusting...' : `${direction === 'add' ? 'Add' : 'Remove'} Stock`}
          </Button>
        </div>
      )}
    </form>
  );

  const mobileFooter = (
    <MobilePrimaryActionStack
      primaryAction={{
        label: adjustMutation.isPending ? 'Adjusting...' : `${direction === 'add' ? 'Add' : 'Remove'} Stock`,
        onClick: handleSubmit,
        disabled: adjustMutation.isPending,
        loading: adjustMutation.isPending,
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
            title="Adjust Inventory"
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
          <DialogTitle>Adjust Inventory</DialogTitle>
          <DialogDescription>
            Add or remove inventory stock for a part with full audit trail.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}