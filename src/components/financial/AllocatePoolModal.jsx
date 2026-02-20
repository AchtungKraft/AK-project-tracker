import React, { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CommitmentActions } from "@/components/financial/financialMutationGuard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Wallet, AlertTriangle, DollarSign, CheckCircle2, 
  Package, TrendingDown, AlertCircle, Ban 
} from "lucide-react";
import { toast } from "sonner";

/**
 * AllocatePoolModal - Allocate pool funds to a commitment
 * 
 * NOTE: This modal is LEGACY MODEL ONLY. 
 * Forward model projects should NOT render this modal.
 * Forward model uses InvoiceBatch for revenue tracking, not pool allocation.
 * 
 * HARD BLOCK: If project.financial_model_version === 'forward', this modal
 * will render a blocked state and NOT allow pool allocation.
 * 
 * Features:
 * - Display all pools for project with balance/status
 * - Show commitment exposure details
 * - Allow allocation amount entry
 * - Validate: amount > 0, warn on overdraw
 * - Route through CommitmentService
 */
export default function AllocatePoolModal({ 
  projectId,
  project,
  commitment = null,
  onClose,
  onSuccess
}) {
  const queryClient = useQueryClient();

  // ============================================
  // HARD BLOCK: Forward model projects cannot use PoolAllocation
  // ============================================
  const { data: fetchedProject } = useQuery({
    queryKey: ['project-for-allocation', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0] || null;
    },
    enabled: !project && !!projectId,
  });

  const effectiveProject = project || fetchedProject;
  const isForwardModel = effectiveProject?.financial_model_version === 'forward';

  // HARD BLOCK: Render blocked UI for forward projects
  if (isForwardModel) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-400" />
              Not Available
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/30 flex items-center justify-center">
              <Ban className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-gray-300 mb-2">
              Pool Allocation is not available for forward model projects.
            </p>
            <p className="text-sm text-gray-500">
              Forward model uses Invoice Batches for client billing. Use the Invoice Workbench instead.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const [selectedPoolId, setSelectedPoolId] = useState(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch pools for project
  const { data: pools = [], isLoading: poolsLoading } = useQuery({
    queryKey: ['projectPools', projectId],
    queryFn: () => base44.entities.BillingPool.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  // Fetch allocations to calculate available
  const { data: allocations = [] } = useQuery({
    queryKey: ['poolAllocations'],
    queryFn: () => base44.entities.PoolAllocation.list(),
    enabled: pools.length > 0
  });

  // Fetch part info if commitment provided
  const { data: part } = useQuery({
    queryKey: ['part', commitment?.part_id],
    queryFn: async () => {
      const parts = await base44.entities.Part.filter({ id: commitment.part_id });
      return parts[0];
    },
    enabled: !!commitment?.part_id
  });

  // Calculate pool data with allocations
  // NULL SAFETY: All pool fields use ?? 0
  const poolsWithData = useMemo(() => {
    return pools.map(pool => {
      const poolAllocations = allocations.filter(a => 
        a.pool_id === pool.id && !a.is_reversed
      );
      const totalAllocated = poolAllocations.reduce((sum, a) => sum + (a.amount_allocated ?? 0), 0);
      
      return {
        ...pool,
        allocations: poolAllocations,
        computedAllocated: totalAllocated,
        available: (pool.paid_amount ?? 0) - totalAllocated - (pool.charges_total ?? 0),
        isActive: ['draft', 'invoiced', 'paid'].includes(pool.status)
      };
    }).filter(p => p.isActive);
  }, [pools, allocations]);

  // Commitment exposure calculation
  const exposureInfo = useMemo(() => {
    if (!commitment) return null;
    
    const planned = commitment.planned_retail_total || 
      ((commitment.qty_committed || 0) * (commitment.unit_retail_snapshot || 0));
    const covered = commitment.covered_retail_total || 0;
    const gap = commitment.exposure_gap ?? (planned - covered);
    
    return {
      planned,
      covered,
      gap,
      coveragePct: planned > 0 ? Math.round((covered / planned) * 100) : 0
    };
  }, [commitment]);

  // Selected pool info
  const selectedPool = poolsWithData.find(p => p.id === selectedPoolId);
  
  // Default amount to exposure gap or available balance (whichever is smaller)
  const suggestedAmount = useMemo(() => {
    if (!selectedPool || !exposureInfo) return 0;
    return Math.min(exposureInfo.gap, Math.max(0, selectedPool.available));
  }, [selectedPool, exposureInfo]);

  // Set default amount when pool selected
  React.useEffect(() => {
    if (selectedPool && !amount && suggestedAmount > 0) {
      setAmount(suggestedAmount.toFixed(2));
    }
  }, [selectedPoolId, suggestedAmount]);

  // Validation
  const parsedAmount = parseFloat(amount) || 0;
  const willOverdraw = selectedPool && parsedAmount > selectedPool.available;
  const exceedsExposure = exposureInfo && parsedAmount > exposureInfo.gap;
  const isValid = parsedAmount > 0 && selectedPoolId && commitment;

  // Mutation
  const allocateMutation = useMutation({
    mutationFn: async () => {
      return CommitmentActions.allocatePool({
        pool_id: selectedPoolId,
        commitment_id: commitment.id,
        amount: parsedAmount,
        allocation_type: 'manual',
        notes: notes || undefined
      });
    },
    onSuccess: (data) => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ['projectPools'] });
      queryClient.invalidateQueries({ queryKey: ['billingPools'] });
      queryClient.invalidateQueries({ queryKey: ['poolAllocations'] });
      queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
      queryClient.invalidateQueries({ queryKey: ['projectCommitments'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioSupplyState'] });
      queryClient.invalidateQueries({ queryKey: ['globalSupplyQueues'] });
      queryClient.invalidateQueries({ queryKey: ['projectSupplyState'] });

      if (data.overdraw) {
        toast.warning(`Allocated $${parsedAmount.toFixed(2)} - pool is now overdrawn`);
      } else {
        toast.success(`Allocated $${parsedAmount.toFixed(2)} to commitment`);
      }
      
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast.error(`Allocation failed: ${error.message}`);
    }
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <DollarSign className="w-5 h-5 text-green-400" />
            Allocate Pool Funds
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Commitment Info */}
          {commitment && (
            <Card className="bg-gray-800/50 border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Package className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-white font-medium">{part?.part_name || 'Loading...'}</p>
                    <p className="text-xs text-gray-500">Qty: {commitment.qty_committed}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-900/50 rounded p-2">
                    <p className="text-xs text-gray-500">Planned Retail</p>
                    <p className="text-sm font-bold text-white">
                      ${(exposureInfo?.planned || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gray-900/50 rounded p-2">
                    <p className="text-xs text-gray-500">Covered</p>
                    <p className="text-sm font-bold text-green-400">
                      ${(exposureInfo?.covered || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gray-900/50 rounded p-2">
                    <p className="text-xs text-gray-500">Exposure Gap</p>
                    <p className={`text-sm font-bold ${(exposureInfo?.gap || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      ${(exposureInfo?.gap || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pool Selection */}
          <div className="space-y-2">
            <Label className="text-gray-300">Select Pool</Label>
            {poolsLoading ? (
              <p className="text-sm text-gray-500">Loading pools...</p>
            ) : poolsWithData.length === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <p className="text-sm text-yellow-400">No active pools available. Create a pool first.</p>
              </div>
            ) : (
              <RadioGroup value={selectedPoolId || ''} onValueChange={setSelectedPoolId}>
                <div className="space-y-2">
                  {poolsWithData.map(pool => (
                    <label
                      key={pool.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedPoolId === pool.id 
                          ? 'bg-green-900/30 border-green-600' 
                          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <RadioGroupItem value={pool.id} className="border-gray-500" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-gray-400" />
                          <span className="text-white font-medium">{pool.pool_name}</span>
                          <Badge 
                            variant="outline" 
                            className={
                              pool.status === 'paid' ? 'border-green-600 text-green-400' :
                              pool.status === 'overdrawn' ? 'border-red-600 text-red-400' :
                              'border-yellow-600 text-yellow-400'
                            }
                          >
                            {pool.status}
                          </Badge>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs">
                          <span className="text-gray-500">Paid: <span className="text-green-400">${(pool.paid_amount || 0).toFixed(2)}</span></span>
                          <span className="text-gray-500">Allocated: <span className="text-blue-400">${(pool.computedAllocated || 0).toFixed(2)}</span></span>
                          <span className="text-gray-500">Available: <span className={pool.available >= 0 ? 'text-white' : 'text-red-400'}>${(pool.available || 0).toFixed(2)}</span></span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            )}
          </div>

          {/* Amount Input */}
          {selectedPool && (
            <div className="space-y-2">
              <Label className="text-gray-300">Allocation Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7 bg-gray-800 border-gray-600 text-white"
                  placeholder="0.00"
                />
              </div>
              
              {/* Quick amount buttons */}
              <div className="flex gap-2 flex-wrap">
                {exposureInfo?.gap > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setAmount(exposureInfo.gap.toFixed(2))}
                    className="border-gray-700 text-xs"
                  >
                    Full Gap (${exposureInfo.gap.toFixed(2)})
                  </Button>
                )}
                {selectedPool.available > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setAmount(selectedPool.available.toFixed(2))}
                    className="border-gray-700 text-xs"
                  >
                    Pool Available (${selectedPool.available.toFixed(2)})
                  </Button>
                )}
                {suggestedAmount > 0 && suggestedAmount !== exposureInfo?.gap && suggestedAmount !== selectedPool.available && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setAmount(suggestedAmount.toFixed(2))}
                    className="border-gray-700 text-xs"
                  >
                    Suggested (${suggestedAmount.toFixed(2)})
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Warnings */}
          {willOverdraw && (
            <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-red-400 font-medium">Overdraw Warning</p>
                <p className="text-gray-400">
                  This allocation exceeds pool available funds by ${(parsedAmount - selectedPool.available).toFixed(2)}. 
                  The pool will be marked as overdrawn.
                </p>
              </div>
            </div>
          )}

          {exceedsExposure && !willOverdraw && (
            <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-yellow-400 font-medium">Over-Coverage</p>
                <p className="text-gray-400">
                  Allocation exceeds exposure gap. Consider allocating only ${exposureInfo.gap.toFixed(2)}.
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-gray-300">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allocation notes..."
              className="bg-gray-800 border-gray-600 text-white"
              rows={2}
            />
          </div>

          {/* Summary */}
          {isValid && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Allocating</span>
                <span className="text-white font-medium">${parsedAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">From Pool</span>
                <span className="text-white">{selectedPool?.pool_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">New Coverage</span>
                <span className="text-green-400">
                  ${((exposureInfo?.covered || 0) + parsedAmount).toFixed(2)} 
                  ({Math.round(((exposureInfo?.covered || 0) + parsedAmount) / (exposureInfo?.planned || 1) * 100)}%)
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">New Exposure Gap</span>
                <span className={((exposureInfo?.gap || 0) - parsedAmount) > 0 ? 'text-yellow-400' : 'text-green-400'}>
                  ${Math.max(0, (exposureInfo?.gap || 0) - parsedAmount).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button 
            onClick={() => allocateMutation.mutate()}
            disabled={!isValid || allocateMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {allocateMutation.isPending ? 'Allocating...' : `Allocate $${parsedAmount.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}