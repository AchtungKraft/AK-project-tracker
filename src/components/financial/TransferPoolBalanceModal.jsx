import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowRight, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { CommitmentActions } from "./financialMutationGuard";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * TransferPoolBalanceModal - Transfer balance between pools
 */
export default function TransferPoolBalanceModal({ pool, onClose }) {
  const queryClient = useQueryClient();
  const [targetPoolId, setTargetPoolId] = useState('');
  const [amount, setAmount] = useState(pool?.balance?.toFixed(2) || '0.00');
  const [notes, setNotes] = useState('');

  const balance = pool?.balance ?? 0;

  // Fetch all pools for target selection
  const { data: allPools = [] } = useQuery({
    queryKey: ['billingPools'],
    queryFn: () => base44.entities.BillingPool.list(),
  });

  // Filter out current pool and closed pools
  const targetPools = allPools.filter(p => 
    p.id !== pool?.id && 
    p.status !== 'closed'
  );

  const transferAmount = parseFloat(amount) || 0;
  const isValidAmount = transferAmount > 0 && transferAmount <= balance;
  const canTransfer = isValidAmount && targetPoolId;

  const targetPool = targetPools.find(p => p.id === targetPoolId);

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!canTransfer) {
        throw new Error('Invalid transfer parameters');
      }
      return CommitmentActions.transferPoolBalance({
        source_pool_id: pool.id,
        target_pool_id: targetPoolId,
        amount: transferAmount,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      // PHASE 17: Deterministic refresh
      const projectIds = [];
      if (pool?.project_id) projectIds.push(pool.project_id);
      if (targetPool?.project_id && !projectIds.includes(targetPool.project_id)) {
        projectIds.push(targetPool.project_id);
      }
      await forceAppRefresh(queryClient, { projectIds });
      toast.success(`$${transferAmount.toFixed(2)} transferred successfully`);
      onClose();
    },
    onError: (error) => {
      toast.error(`Transfer failed: ${error.message}`);
    }
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ArrowRight className="w-5 h-5 text-blue-400" />
            Transfer Pool Balance
          </DialogTitle>
          <DialogDescription>
            Transfer funds from this pool to another pool.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source Pool Info */}
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">From Pool</span>
              <span className="text-white font-medium">{pool?.pool_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Available Balance</span>
              <span className={`text-xl font-bold ${balance > 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${balance.toFixed(2)}
              </span>
            </div>
          </div>

          {/* No balance warning */}
          {balance <= 0 && (
            <div className="flex items-start gap-3 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-300 text-sm">No balance to transfer</p>
                <p className="text-yellow-400/70 text-xs mt-1">
                  Pool must have a positive balance to transfer funds.
                </p>
              </div>
            </div>
          )}

          {balance > 0 && (
            <>
              {/* Amount */}
              <div className="space-y-2">
                <Label className="text-gray-300">Amount to Transfer</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={balance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-9 bg-gray-800 border-gray-600 text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setAmount(balance.toFixed(2))}
                    className="border-gray-600 text-xs"
                  >
                    Transfer All
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setAmount((balance / 2).toFixed(2))}
                    className="border-gray-600 text-xs"
                  >
                    Transfer Half
                  </Button>
                </div>
              </div>

              {/* Target Pool */}
              <div className="space-y-2">
                <Label className="text-gray-300">To Pool</Label>
                <Select value={targetPoolId} onValueChange={setTargetPoolId}>
                  <SelectTrigger className="bg-gray-800 border-gray-600">
                    <SelectValue placeholder="Select target pool..." />
                  </SelectTrigger>
                  <SelectContent>
                    {targetPools.length === 0 ? (
                      <SelectItem value={null} disabled>No other pools available</SelectItem>
                    ) : (
                      targetPools.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{p.pool_name}</span>
                            <span className="text-gray-400 text-xs ml-2">
                              (${(p.balance || 0).toFixed(2)})
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Transfer Preview */}
              {targetPool && isValidAmount && (
                <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1 text-center">
                      <p className="text-gray-400">From</p>
                      <p className="text-white font-medium">{pool?.pool_name}</p>
                      <p className="text-red-400">-${transferAmount.toFixed(2)}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-blue-400" />
                    <div className="flex-1 text-center">
                      <p className="text-gray-400">To</p>
                      <p className="text-white font-medium">{targetPool.pool_name}</p>
                      <p className="text-green-400">+${transferAmount.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-gray-300">Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason for transfer..."
                  className="bg-gray-800 border-gray-600 text-white"
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={() => transferMutation.mutate()}
            disabled={!canTransfer || transferMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {transferMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            Transfer ${transferAmount.toFixed(2)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}