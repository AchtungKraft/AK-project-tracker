import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CommitmentActions } from "@/components/financial/financialMutationGuard";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

const REVERSAL_TYPES = [
  { value: 'scope_reduction', label: 'Scope Reduction', description: 'Part no longer needed in project scope' },
  { value: 'warranty', label: 'Warranty', description: 'Part being returned under warranty' },
  { value: 'error', label: 'Error', description: 'Installation was recorded in error' },
  { value: 'upgrade_swap', label: 'Upgrade/Swap', description: 'Part being replaced with different part' },
  { value: 'other', label: 'Other', description: 'Other reason (specify in notes)' },
];

/**
 * ReverseInstallationModal - Reverse an installed part
 * 
 * Routes exclusively through CommitmentService.reverseInstalledPart()
 * No direct entity mutations allowed.
 */
export default function ReverseInstallationModal({ 
  installedPart, 
  part,
  commitment,
  onClose 
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [reversalType, setReversalType] = useState('');

  const reverseMutation = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) {
        throw new Error('Reversal reason is required');
      }
      if (!reversalType) {
        throw new Error('Reversal type is required');
      }

      // Route through CommitmentService - no direct entity mutations
      return CommitmentActions.reverseInstalledPart({
        installed_part_id: installedPart.id,
        reason: reason.trim(),
        reversal_type: reversalType,
      });
    },
    onSuccess: async (data) => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: part?.id ? [part.id] : [],
        commitmentIds: commitment?.id ? [commitment.id] : [],
        projectIds: commitment?.project_id ? [commitment.project_id] : [],
      });
      
      if (data.alreadyReversed) {
        toast.info('Installation was already reversed');
      } else {
        toast.success('Installation reversed successfully');
      }
      onClose();
    },
    onError: (error) => {
      toast.error(`Reversal failed: ${error.message}`);
    }
  });

  const isValid = reason.trim().length > 0 && reversalType;
  const selectedTypeInfo = REVERSAL_TYPES.find(t => t.value === reversalType);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <RotateCcw className="w-5 h-5 text-orange-400" />
            Reverse Installation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3 bg-orange-900/30 border border-orange-700/50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-orange-400 font-medium">This action will:</p>
              <ul className="text-gray-300 mt-1 space-y-1 list-disc list-inside">
                <li>Restore {installedPart.qty_consumed} unit(s) to inventory</li>
                <li>Update commitment installed quantity</li>
                <li>Mark installation record as reversed</li>
                <li>Create audit trail entry</li>
              </ul>
            </div>
          </div>

          {/* Part Info */}
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              {part?.featured_photo ? (
                <img src={part.featured_photo} alt="" className="w-12 h-12 rounded object-contain bg-gray-800" />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center">
                  <Package className="w-6 h-6 text-gray-600" />
                </div>
              )}
              <div>
                <p className="text-white font-medium">{part?.part_name || 'Unknown Part'}</p>
                {part?.vendor_part_number && (
                  <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                )}
              </div>
            </div>

            {/* Installation Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-gray-900/50 rounded">
                <p className="text-xs text-gray-400">Qty Installed</p>
                <p className="text-lg font-bold text-green-400">{installedPart.qty_consumed || 0}</p>
              </div>
              <div className="p-2 bg-gray-900/50 rounded">
                <p className="text-xs text-gray-400">Unit Cost</p>
                <p className="text-lg font-bold text-white">
                  ${(installedPart.unit_cost_at_install || 0).toFixed(2)}
                </p>
              </div>
              <div className="p-2 bg-gray-900/50 rounded col-span-2">
                <p className="text-xs text-gray-400">Extended Cost</p>
                <p className="text-lg font-bold text-yellow-400">
                  ${(installedPart.extended_cost || 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Commitment Info */}
            {commitment && (
              <div className="pt-2 border-t border-gray-700">
                <p className="text-xs text-gray-400">
                  Commitment: <span className="text-purple-400">{commitment.id.slice(0, 8)}...</span>
                </p>
                <p className="text-xs text-gray-400">
                  Status: <Badge variant="outline" className="border-gray-600 ml-1">{commitment.commitment_status}</Badge>
                </p>
              </div>
            )}
          </div>

          {/* Reversal Type */}
          <div className="space-y-2">
            <Label className="text-gray-300">Reversal Type *</Label>
            <Select value={reversalType} onValueChange={setReversalType}>
              <SelectTrigger className="bg-gray-800 border-gray-600">
                <SelectValue placeholder="Select reversal type..." />
              </SelectTrigger>
              <SelectContent>
                {REVERSAL_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-gray-500">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTypeInfo && (
              <p className="text-xs text-gray-500">{selectedTypeInfo.description}</p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-gray-300">Reversal Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this installation is being reversed..."
              className="bg-gray-800 border-gray-600 text-white"
              rows={3}
            />
            <p className="text-xs text-gray-500">
              Required for audit trail. Be specific about why the reversal is needed.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="border-gray-600"
            disabled={reverseMutation.isPending}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => reverseMutation.mutate()}
            disabled={reverseMutation.isPending || !isValid}
            className="bg-orange-600 hover:bg-orange-700 gap-2"
          >
            {reverseMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Reversing...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Reverse Installation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}