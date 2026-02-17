import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CommitmentActions } from "@/components/financial/financialMutationGuard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * ClosePoolModal - Close a billing pool
 * 
 * Modes:
 * - zero_balance: Only if balance is $0
 * - force: Close even with remaining balance (admin)
 */
export default function ClosePoolModal({ pool, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [closeMode, setCloseMode] = useState('zero_balance');
  const [reason, setReason] = useState('');

  const balance = pool.balance || 0;
  const canZeroClose = Math.abs(balance) < 0.01;

  const closeMutation = useMutation({
    mutationFn: async () => {
      return CommitmentActions.closePool({
        pool_id: pool.id,
        close_mode: closeMode,
        reason: reason || `Pool closed by user`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectPools'] });
      queryClient.invalidateQueries({ queryKey: ['billingPools'] });
      toast.success('Pool closed successfully');
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to close pool: ${error.message}`);
    }
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" />
            Close Pool
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Pool Info */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Pool</span>
              <span className="text-white font-medium">{pool.pool_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Current Balance</span>
              <span className={balance >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                ${balance.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Status</span>
              <Badge variant="outline" className={
                pool.status === 'paid' ? 'border-green-600 text-green-400' :
                pool.status === 'overdrawn' ? 'border-red-600 text-red-400' :
                'border-gray-600 text-gray-400'
              }>
                {pool.status}
              </Badge>
            </div>
          </div>

          {/* Close Mode Selection */}
          <div className="space-y-3">
            <Label className="text-gray-300">Close Mode</Label>
            <RadioGroup value={closeMode} onValueChange={setCloseMode}>
              <label 
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  closeMode === 'zero_balance' 
                    ? 'bg-green-900/20 border-green-600' 
                    : 'bg-gray-800/50 border-gray-700'
                } ${!canZeroClose ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <RadioGroupItem 
                  value="zero_balance" 
                  disabled={!canZeroClose}
                  className="border-gray-500"
                />
                <div>
                  <p className="text-white font-medium">Zero Balance Close</p>
                  <p className="text-xs text-gray-500">Close only if balance is $0</p>
                </div>
              </label>
              
              <label 
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  closeMode === 'force' 
                    ? 'bg-red-900/20 border-red-600' 
                    : 'bg-gray-800/50 border-gray-700'
                }`}
              >
                <RadioGroupItem value="force" className="border-gray-500" />
                <div>
                  <p className="text-white font-medium">Force Close</p>
                  <p className="text-xs text-gray-500">Close with remaining balance (admin only)</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Warning for force close */}
          {closeMode === 'force' && balance !== 0 && (
            <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-red-400 font-medium">Warning: Non-Zero Balance</p>
                <p className="text-gray-400">
                  Pool has ${Math.abs(balance).toFixed(2)} {balance > 0 ? 'remaining' : 'overdrawn'}.
                  Force closing will prevent future allocations.
                </p>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <Label className="text-gray-300">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white mt-1 h-16"
              placeholder="Why is this pool being closed?"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending || (closeMode === 'zero_balance' && !canZeroClose)}
            className="bg-red-600 hover:bg-red-700"
          >
            {closeMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Close Pool
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}