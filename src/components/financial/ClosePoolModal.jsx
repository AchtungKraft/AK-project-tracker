import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Lock, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { CommitmentActions } from "./financialMutationGuard";

/**
 * ClosePoolModal - Close a billing pool
 * Only allows close when balance == 0 or after transfer
 */
export default function ClosePoolModal({ pool, onClose }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const balance = pool?.balance ?? 0;
  const canClose = Math.abs(balance) < 0.01; // Allow close if balance is essentially zero

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!canClose) {
        throw new Error('Cannot close pool with non-zero balance');
      }
      return CommitmentActions.closePool({
        pool_id: pool.id,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billingPools'] });
      queryClient.invalidateQueries({ queryKey: ['billingPool'] });
      toast.success('Pool closed successfully');
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to close pool: ${error.message}`);
    }
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Lock className="w-5 h-5 text-gray-400" />
            Close Pool
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pool Info */}
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-400">Pool</span>
              <span className="text-white font-medium">{pool?.pool_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Current Balance</span>
              <span className={`text-lg font-bold ${balance > 0 ? 'text-green-400' : balance < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                ${balance.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Warning if balance != 0 */}
          {!canClose && (
            <div className="flex items-start gap-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-medium">Cannot Close Pool</p>
                <p className="text-red-400/70 text-sm mt-1">
                  Pool has a non-zero balance of ${balance.toFixed(2)}. 
                  {balance > 0 
                    ? ' Transfer remaining balance to another pool first.'
                    : ' Resolve overdrawn balance before closing.'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Close confirmation */}
          {canClose && (
            <div className="flex items-start gap-3 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg">
              <DollarSign className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p>Closing this pool will:</p>
                <ul className="list-disc list-inside mt-1 text-gray-400">
                  <li>Mark the pool as closed</li>
                  <li>Prevent new allocations or charges</li>
                  <li>Preserve audit history</li>
                </ul>
              </div>
            </div>
          )}

          {/* Notes */}
          {canClose && (
            <div className="space-y-2">
              <Label className="text-gray-300">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for closing..."
                className="bg-gray-800 border-gray-600 text-white"
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={() => closeMutation.mutate()}
            disabled={!canClose || closeMutation.isPending}
            className="bg-gray-600 hover:bg-gray-700 gap-2"
          >
            {closeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            Close Pool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}