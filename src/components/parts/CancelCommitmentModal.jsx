import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, XCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * CancelCommitmentModal - Handle commitment cancellation with validation
 * 
 * Rules:
 * - Cancellation allowed only if qty_installed = 0
 * - Does NOT delete record, sets status to cancelled
 * - Logs audit entry
 */
export default function CancelCommitmentModal({ 
  commitment, 
  part,
  project,
  onClose 
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [reduceQty, setReduceQty] = useState(false);
  const [newQtyCommitted, setNewQtyCommitted] = useState(commitment.qty_installed || 0);

  const canCancel = (commitment.qty_installed || 0) === 0;
  const canReduce = (commitment.qty_installed || 0) > 0;
  const minQty = commitment.qty_installed || 0;

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      // Full cancellation
      await base44.entities.PartCommitment.update(commitment.id, {
        commitment_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason || 'User requested cancellation',
        cancelled_by: user.email,
        commitment_version: (commitment.commitment_version || 1) + 1
      });

      // Audit log
      await base44.entities.CommitmentAuditLog.create({
        commitment_id: commitment.id,
        action_type: 'status_change',
        previous_values: {
          commitment_status: commitment.commitment_status,
          qty_committed: commitment.qty_committed
        },
        new_values: {
          commitment_status: 'cancelled',
          cancelled_reason: reason
        },
        trigger_source: 'cancel',
        triggered_by: user.email,
        validation_passed: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      toast.success('Commitment cancelled');
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    }
  });

  const reduceMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      // Reduce qty_committed to new value
      const qtyReduced = commitment.qty_committed - newQtyCommitted;
      
      await base44.entities.PartCommitment.update(commitment.id, {
        qty_committed: newQtyCommitted,
        qty_cancelled: (commitment.qty_cancelled || 0) + qtyReduced,
        commitment_version: (commitment.commitment_version || 1) + 1
      });

      // Audit log
      await base44.entities.CommitmentAuditLog.create({
        commitment_id: commitment.id,
        action_type: 'qty_change',
        previous_values: {
          qty_committed: commitment.qty_committed,
          qty_cancelled: commitment.qty_cancelled
        },
        new_values: {
          qty_committed: newQtyCommitted,
          qty_cancelled: (commitment.qty_cancelled || 0) + qtyReduced,
          reduction_reason: reason
        },
        trigger_source: 'cancel',
        triggered_by: user.email,
        validation_passed: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      toast.success('Commitment quantity reduced');
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to reduce: ${error.message}`);
    }
  });

  const handleSubmit = () => {
    if (reduceQty) {
      reduceMutation.mutate();
    } else {
      cancelMutation.mutate();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <XCircle className="w-5 h-5 text-red-400" />
            {canCancel ? 'Cancel Commitment' : 'Reduce Commitment'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Part/Project Info */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-white font-medium">{part?.part_name}</span>
            </div>
            <div className="text-sm text-gray-400">
              Project: {project?.name}
            </div>
          </div>

          {/* Current Quantities */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Committed</p>
              <p className="text-lg font-bold text-white">{commitment.qty_committed || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Ordered</p>
              <p className="text-lg font-bold text-purple-400">{commitment.qty_ordered || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Installed</p>
              <p className="text-lg font-bold text-green-400">{commitment.qty_installed || 0}</p>
            </div>
          </div>

          {/* Validation Warning */}
          {!canCancel && (
            <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-yellow-400 font-medium">Cannot fully cancel</p>
                <p className="text-gray-400">
                  {commitment.qty_installed} unit(s) have been installed. 
                  You can reduce the committed quantity to match installed.
                </p>
              </div>
            </div>
          )}

          {/* Action Selection */}
          {canReduce && !canCancel && (
            <div className="space-y-3">
              <Label className="text-gray-300">Reduce to installed quantity</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={minQty}
                  max={commitment.qty_committed}
                  value={newQtyCommitted}
                  onChange={(e) => setNewQtyCommitted(Math.max(minQty, parseInt(e.target.value) || minQty))}
                  className="w-24 bg-gray-800 border-gray-600"
                />
                <span className="text-gray-400 text-sm">
                  (min: {minQty} installed)
                </span>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-gray-300">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this commitment being cancelled/reduced?"
              className="bg-gray-800 border-gray-600 text-white"
              rows={2}
            />
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Current status:</span>
            <Badge variant="outline" className="border-purple-600 text-purple-400">
              {commitment.commitment_status}
            </Badge>
            <span className="text-gray-500">→</span>
            <Badge variant="outline" className="border-red-600 text-red-400">
              {canCancel ? 'cancelled' : 'reduced'}
            </Badge>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Keep Commitment
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={cancelMutation.isPending || reduceMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {cancelMutation.isPending || reduceMutation.isPending ? 'Processing...' : 
             canCancel ? 'Cancel Commitment' : 'Reduce Quantity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}