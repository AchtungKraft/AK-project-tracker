import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  DollarSign,
  Lock,
  Unlock,
  AlertTriangle,
  Loader2,
  Calculator
} from "lucide-react";
import { toast } from "sonner";
import { applyRetailPricing, getPricingDisplayInfo } from "./pricingUtils";

/**
 * BuildPartPricingEditor - Edit pricing for a build part assignment
 */
export default function BuildPartPricingEditor({ assignment, part, onClose }) {
  const queryClient = useQueryClient();
  
  const [defaultCost, setDefaultCost] = useState(
    assignment?.default_cost?.toString() || part?.default_cost?.toString() || ''
  );
  const [pricingLocked, setPricingLocked] = useState(assignment?.pricing_locked || false);
  const [unitRetailOverride, setUnitRetailOverride] = useState(
    assignment?.unit_retail_override?.toString() || ''
  );

  const { data: matrixTiers = [] } = useQuery({
    queryKey: ['retailMarkupMatrix'],
    queryFn: () => base44.entities.RetailMarkupMatrix.list(),
  });

  // Calculate preview
  const costValue = parseFloat(defaultCost) || 0;
  const previewPricing = applyRetailPricing({}, costValue, matrixTiers);
  const currentDisplay = getPricingDisplayInfo(assignment);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const costNum = parseFloat(defaultCost) || 0;
      
      if (pricingLocked) {
        // Locked: use override value
        const overrideNum = parseFloat(unitRetailOverride) || 0;
        if (overrideNum <= 0) {
          throw new Error('Please enter a valid override retail price');
        }
        
        return base44.entities.PartBuildAssignment.update(assignment.id, {
          default_cost: costNum,
          pricing_locked: true,
          unit_retail_override: overrideNum,
          unit_retail: overrideNum,
          pricing_source: 'override',
          applied_markup_pct: null
        });
      } else {
        // Not locked: calculate from matrix
        const pricingFields = applyRetailPricing({}, costNum, matrixTiers);
        
        if (!pricingFields && costNum > 0) {
          throw new Error('No matching matrix tier found for this cost');
        }
        
        return base44.entities.PartBuildAssignment.update(assignment.id, {
          default_cost: costNum,
          pricing_locked: false,
          unit_retail_override: null,
          ...(pricingFields || { unit_retail: 0, applied_markup_pct: null, pricing_source: 'matrix' })
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
      toast.success('Pricing updated');
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update pricing');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Edit Part Pricing
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Part Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm font-medium text-white">{part?.part_name}</p>
            {part?.vendor_part_number && (
              <p className="text-xs text-gray-400 font-mono">{part.vendor_part_number}</p>
            )}
          </div>

          {/* Current Pricing Display */}
          <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700">
            <Label className="text-xs text-gray-500">Current Pricing</Label>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-lg font-bold text-green-400">
                ${currentDisplay.unitRetail?.toFixed(2) || '0.00'}
              </span>
              <Badge 
                className={
                  currentDisplay.source === 'override' 
                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' 
                    : currentDisplay.source === 'matrix'
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                    : 'bg-gray-500/20 text-gray-400 border-gray-500/50'
                }
              >
                {currentDisplay.label}
              </Badge>
              {currentDisplay.markup && (
                <span className="text-xs text-gray-400">
                  ({(currentDisplay.markup * 100).toFixed(0)}% markup)
                </span>
              )}
            </div>
          </div>

          {/* Cost Input */}
          <div>
            <Label className="text-gray-300">Default Cost</Label>
            <div className="relative mt-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                type="number"
                step="0.01"
                min="0"
                value={defaultCost}
                onChange={(e) => setDefaultCost(e.target.value)}
                className="pl-8 bg-gray-800 border-gray-700"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Lock Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg border border-gray-700">
            <div className="flex items-center gap-2">
              {pricingLocked ? (
                <Lock className="w-4 h-4 text-purple-400" />
              ) : (
                <Unlock className="w-4 h-4 text-gray-400" />
              )}
              <div>
                <Label className="text-gray-300">Lock Pricing</Label>
                <p className="text-xs text-gray-500">Use custom override instead of matrix</p>
              </div>
            </div>
            <Switch
              checked={pricingLocked}
              onCheckedChange={setPricingLocked}
            />
          </div>

          {/* Override or Preview */}
          {pricingLocked ? (
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-purple-400" />
                Custom / Engineered Price
              </Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitRetailOverride}
                  onChange={(e) => setUnitRetailOverride(e.target.value)}
                  className="pl-8 bg-gray-800 border-gray-700"
                  placeholder="Enter override price..."
                />
              </div>
              <p className="text-xs text-purple-400 mt-1">
                This price will NOT auto-update when cost or matrix changes
              </p>
            </div>
          ) : (
            <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-4 h-4 text-blue-400" />
                <Label className="text-blue-300">Matrix Preview</Label>
              </div>
              {previewPricing ? (
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-500">Unit Retail:</span>
                    <span className="ml-2 text-lg font-bold text-green-400">
                      ${previewPricing.unit_retail?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">Markup:</span>
                    <span className="ml-2 text-blue-400">
                      {((previewPricing.applied_markup_pct || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ) : costValue > 0 ? (
                <p className="text-amber-400 text-sm">No matching tier for this cost</p>
              ) : (
                <p className="text-gray-500 text-sm">Enter a cost to preview pricing</p>
              )}
            </div>
          )}

          {/* Actions */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-green-600 hover:bg-green-700"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <DollarSign className="w-4 h-4 mr-2" />
              )}
              Save Pricing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}