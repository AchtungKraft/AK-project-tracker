import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Plus,
  Minus,
  ArrowRightLeft,
  Scissors,
  X,
  Check,
  Loader2,
  Package,
  ShoppingCart,
  Truck,
  Wrench,
  DollarSign,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";
import { normalizePreviewResponse, EMPTY_PREVIEW } from "@/components/supply/previewResponseAdapter";

const ACTION_TYPES = {
  INCREASE_QTY: 'INCREASE_QTY',
  DECREASE_QTY: 'DECREASE_QTY',
  REALLOCATE_TO_PROJECT: 'REALLOCATE_TO_PROJECT',
  CANCEL_UNORDERED_QTY: 'CANCEL_UNORDERED_QTY',
  SPLIT_COMMITMENT: 'SPLIT_COMMITMENT'
};

// Quantity State Matrix Display
// Quantity State Matrix Display - uses canonical field names
const QuantityStateMatrix = ({ commitment }) => {
  // Guard against undefined commitment
  if (!commitment) return null;
  
  // Use canonical fields with fallback to legacy
  const required_total = commitment.required_total ?? commitment.qty_committed ?? 0;
  const reserved_from_stock = commitment.reserved_from_stock ?? commitment.qty_reserved ?? 0;
  const covered_from_po = commitment.covered_from_po ?? 0;
  const qty_installed = commitment.qty_installed ?? 0;
  const qty_cancelled = commitment.qty_cancelled ?? 0;
  
  // Compute derived values (canonical)
  const coverage_total = reserved_from_stock + covered_from_po;
  const gap = Math.max(0, required_total - coverage_total);
  const received_not_installed = Math.max(0, reserved_from_stock - qty_installed);

  const stages = [
    { label: 'Required', value: required_total, color: 'bg-gray-500', icon: Package },
    { label: 'Reserved', value: reserved_from_stock, color: 'bg-cyan-500', icon: Package },
    { label: 'On Order', value: covered_from_po, color: 'bg-purple-500', icon: ShoppingCart },
    { label: 'To Order', value: gap, color: 'bg-red-500', icon: ShoppingCart },
    { label: 'Received', value: received_not_installed, color: 'bg-blue-500', icon: Truck },
    { label: 'Installed', value: qty_installed, color: 'bg-green-500', icon: Wrench },
  ];

  // Coverage percentage from canonical values
  const coveragePct = required_total > 0 ? Math.round((coverage_total / required_total) * 100) : 0;

  const remaining = {
    toOrder: gap,
    toReceive: covered_from_po,
    toInstall: Math.max(0, reserved_from_stock - qty_installed)
  };

  return (
    <div className="space-y-4">
      {/* Coverage summary - using canonical values */}
      <div className="bg-gray-800/50 rounded-lg p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">Coverage</span>
          <span className={cn(
            "text-sm font-bold",
            coveragePct >= 100 ? "text-green-400" : coveragePct > 0 ? "text-yellow-400" : "text-red-400"
          )}>
            {coveragePct}%
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all",
              coveragePct >= 100 ? "bg-green-500" : coveragePct > 0 ? "bg-yellow-500" : "bg-red-500"
            )}
            style={{ width: `${Math.min(100, coveragePct)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {coverage_total} of {required_total} covered (reserved + on order)
        </p>
      </div>

      {/* Progress bars - using required_total as denominator */}
      <div className="space-y-2">
        {stages.map((stage, idx) => {
          const Icon = stage.icon;
          const pct = required_total > 0 ? (stage.value / required_total) * 100 : 0;
          return (
            <div key={stage.label} className="flex items-center gap-3">
              <div className="w-24 flex items-center gap-2 text-sm text-gray-400">
                <Icon className="w-4 h-4" />
                {stage.label}
              </div>
              <div className="flex-1">
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all", stage.color)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="w-12 text-right text-sm text-white font-medium">{stage.value}</span>
            </div>
          );
        })}
      </div>

      {/* Remaining counts */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800">
        <div className="text-center">
          <p className="text-xs text-gray-500">To Order</p>
          <p className={cn("text-lg font-bold", remaining.toOrder > 0 ? "text-purple-400" : "text-gray-600")}>
            {remaining.toOrder}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">To Receive</p>
          <p className={cn("text-lg font-bold", remaining.toReceive > 0 ? "text-blue-400" : "text-gray-600")}>
            {remaining.toReceive}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">To Install</p>
          <p className={cn("text-lg font-bold", remaining.toInstall > 0 ? "text-green-400" : "text-gray-600")}>
            {remaining.toInstall}
          </p>
        </div>
      </div>

      {/* Cancelled indicator */}
      {qty_cancelled > 0 && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">
          <X className="w-4 h-4" />
          <span>{qty_cancelled} cancelled</span>
        </div>
      )}
    </div>
  );
};

// Inline Qty Stepper - uses canonical dispatcher via useSupplyAction hook
export const InlineQtyStepper = ({ commitment, onMutationSuccess, disabled = false }) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const queryClient = useQueryClient();

  // Use canonical supply action dispatcher
  const mutation = useMutation({
    mutationFn: async ({ action_type, qty_delta, reason }) => {
      if (!commitment || commitment.required_total === undefined) throw new Error('No valid commitment provided');
      // Calculate new required_total based on action
      const currentRequired = commitment.required_total ?? commitment.qty_committed ?? 0;
      let newRequired;
      
      if (action_type === ACTION_TYPES.INCREASE_QTY) {
        newRequired = currentRequired + qty_delta;
      } else if (action_type === ACTION_TYPES.DECREASE_QTY) {
        newRequired = Math.max(0, currentRequired - qty_delta);
      } else {
        throw new Error(`Unsupported action type: ${action_type}`);
      }

      // Route through canonical dispatcher - use required_total_set
      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADJUST_REQUIRED',
        commitment_ids: [commitment.id],
        payload: { required_total_set: newRequired },
        dry_run: false
      });
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      return response.data;
    },
    onSuccess: async (data) => {
      toast.success(`Quantity updated to ${data.required_total}`);
      
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: commitment?.part_id ? [commitment.part_id] : [],
        projectIds: commitment?.project_id ? [commitment.project_id] : [],
        commitmentIds: [commitment.id],
      });
      onMutationSuccess?.();
      
      setShowConfirmModal(false);
      setPendingAction(null);
    },
    onError: (error) => {
      toast.error(error.message);
      setShowConfirmModal(false);
      setPendingAction(null);
    }
  });

  // Guard against undefined commitment
  if (!commitment) return null;

  const handleIncrement = () => {
    setPendingAction({ action_type: ACTION_TYPES.INCREASE_QTY, qty_delta: 1 });
    setShowConfirmModal(true);
  };

  const handleDecrement = () => {
    // Use canonical fields with legacy fallback
    const currentRequired = commitment.required_total ?? commitment.qty_committed ?? 0;
    const installedQty = commitment.qty_installed ?? 0;
    const onOrderQty = commitment.covered_from_po ?? commitment.qty_ordered ?? 0;
    const minQty = Math.max(installedQty, onOrderQty);
    
    if (currentRequired <= minQty) {
      toast.error(`Cannot reduce below ${minQty} (${onOrderQty > installedQty ? 'ordered' : 'installed'} qty)`);
      return;
    }
    setPendingAction({ action_type: ACTION_TYPES.DECREASE_QTY, qty_delta: 1 });
    setShowConfirmModal(true);
  };

  const handleConfirm = (reason) => {
    if (pendingAction) {
      mutation.mutate({ ...pendingAction, reason });
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 border-gray-700"
          onClick={handleDecrement}
          disabled={disabled || mutation.isPending}
        >
          <Minus className="w-3 h-3" />
        </Button>
        <span className="w-8 text-center text-white font-medium">
          {commitment.required_total ?? commitment.qty_committed ?? 0}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 border-gray-700"
          onClick={handleIncrement}
          disabled={disabled || mutation.isPending}
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      <ConfirmMutationModal
        open={showConfirmModal}
        onClose={() => { setShowConfirmModal(false); setPendingAction(null); }}
        onConfirm={handleConfirm}
        action={pendingAction}
        commitment={commitment}
        isLoading={mutation.isPending}
      />
    </>
  );
};

// Confirm Mutation Modal
const ConfirmMutationModal = ({ open, onClose, onConfirm, action, commitment, isLoading }) => {
  const [reason, setReason] = useState('');

  const actionLabels = {
    [ACTION_TYPES.INCREASE_QTY]: 'Add More',
    [ACTION_TYPES.DECREASE_QTY]: 'Reduce Quantity',
    [ACTION_TYPES.REALLOCATE_TO_PROJECT]: 'Move to Project',
    [ACTION_TYPES.CANCEL_UNORDERED_QTY]: 'Cancel Unordered',
    [ACTION_TYPES.SPLIT_COMMITMENT]: 'Split'
  };

  if (!action) return null;

  const currentQty = commitment?.required_total ?? commitment?.qty_committed ?? 0;
  const newQty = currentQty + (action.action_type === ACTION_TYPES.INCREASE_QTY ? action.qty_delta : -action.qty_delta);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">
            {actionLabels[action.action_type]}
          </DialogTitle>
          <DialogDescription>
            {action.action_type === ACTION_TYPES.INCREASE_QTY
              ? `Add ${action.qty_delta} to the project requirement.`
              : `Reduce the project requirement by ${action.qty_delta}.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">Quantity</span>
            <span className="text-sm text-white">
              {currentQty} → <span className="font-bold">{newQty}</span>
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-400 text-xs">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Client requested additional unit"
              className="bg-gray-800 border-gray-700 text-white"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading} className="border-gray-700">
            Cancel
          </Button>
          <Button 
            onClick={() => onConfirm(reason)}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Main Commitment Quantity Manager Component
// CRITICAL: commitment prop may be undefined if Radix Sheet renders children while closed
export default function CommitmentQuantityManager({ 
  commitment, 
  part,
  onClose, 
  onSuccess 
}) {
  // EARLY GUARD: Radix Sheet may render children even when open=false.
  // All hooks below must use safeCommitment, never raw commitment prop.
  const safeCommitment = (commitment && commitment.required_total !== undefined) ? commitment : null;
  
  const [activeAction, setActiveAction] = useState(null);
  const [qtyInput, setQtyInput] = useState(1);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [reason, setReason] = useState('');
  const [impactPreview, setImpactPreview] = useState(null);
  const queryClient = useQueryClient();

  // Fetch projects for reallocation — disabled when no commitment
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
    enabled: !!safeCommitment,
  });

  const otherProjects = projects.filter(p => p.id !== safeCommitment?.project_id);

  // Dry run mutation for impact preview - use canonical dispatcher
  const previewMutation = useMutation({
    mutationFn: async (params) => {
      if (!safeCommitment) throw new Error('No valid commitment');
      const currentRequired = safeCommitment.required_total ?? safeCommitment.qty_committed ?? 0;
      let newRequired;
      
      if (params.action_type === ACTION_TYPES.INCREASE_QTY) {
        newRequired = currentRequired + params.qty_delta;
      } else if (params.action_type === ACTION_TYPES.DECREASE_QTY) {
        newRequired = Math.max(0, currentRequired - params.qty_delta);
      } else {
        newRequired = currentRequired;
      }

      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADJUST_REQUIRED',
        commitment_ids: [safeCommitment.id],
        payload: { required_total_set: newRequired },
        dry_run: true
      });
      return response.data;
    },
    onSuccess: (data) => {
      setImpactPreview(normalizePreviewResponse(data));
    }
  });

  // Execute mutation - use canonical dispatcher
  const executeMutation = useMutation({
    mutationFn: async (params) => {
      if (!safeCommitment) throw new Error('No valid commitment');
      const currentRequired = safeCommitment.required_total ?? safeCommitment.qty_committed ?? 0;
      let newRequired;
      
      if (params.action_type === ACTION_TYPES.INCREASE_QTY) {
        newRequired = currentRequired + params.qty_delta;
      } else if (params.action_type === ACTION_TYPES.DECREASE_QTY) {
        newRequired = Math.max(0, currentRequired - params.qty_delta);
      } else {
        newRequired = currentRequired;
      }

      const response = await base44.functions.invoke('executeSupplyAction', {
        action_type: 'ADJUST_REQUIRED',
        commitment_ids: [safeCommitment.id],
        payload: { required_total_set: newRequired },
        dry_run: false
      });
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.success) {
        toast.success(`Quantity updated to ${data.required_total}`);
        // PHASE 17: Deterministic refresh
        await forceAppRefresh(queryClient, {
          partIds: safeCommitment?.part_id ? [safeCommitment.part_id] : [],
          projectIds: safeCommitment?.project_id ? [safeCommitment.project_id] : [],
          commitmentIds: safeCommitment ? [safeCommitment.id] : [],
        });
        onSuccess?.();
        onClose?.();
      } else {
        toast.error(data.error || 'Operation failed');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handlePreview = () => {
    if (!activeAction || !safeCommitment) return;
    
    previewMutation.mutate({
      commitment_id: safeCommitment.id,
      action_type: activeAction,
      qty_delta: qtyInput,
      target_project_id: targetProjectId || undefined
    });
  };

  const handleExecute = () => {
    if (!activeAction || !safeCommitment) return;

    executeMutation.mutate({
      commitment_id: safeCommitment.id,
      action_type: activeAction,
      qty_delta: qtyInput,
      target_project_id: targetProjectId || undefined,
      reason
    });
  };

  // Calculate constraints - use canonical fields with legacy fallback
  const constraints = useMemo(() => {
    if (!safeCommitment) return { maxDecrease: 0, maxCancelUnordered: 0, maxSplit: 0, maxMove: 0 };
    
    const required_total = safeCommitment.required_total ?? safeCommitment.qty_committed ?? 0;
    const covered_from_po = safeCommitment.covered_from_po ?? safeCommitment.qty_ordered ?? 0;
    const qty_installed = safeCommitment.qty_installed ?? 0;
    
    return {
      maxDecrease: required_total - Math.max(covered_from_po, qty_installed),
      maxCancelUnordered: Math.max(0, required_total - (safeCommitment.reserved_from_stock ?? 0) - covered_from_po),
      maxSplit: required_total - 1,
      maxMove: required_total - qty_installed
    };
  }, [safeCommitment]);

  // Guard against undefined commitment (after all hooks)
  if (!safeCommitment) {
    return null;
  }

  const actions = [
    {
      type: ACTION_TYPES.INCREASE_QTY,
      label: 'Add More',
      icon: Plus,
      color: 'text-green-400',
      description: 'Need more for this project'
    },
    {
      type: ACTION_TYPES.DECREASE_QTY,
      label: 'Reduce',
      icon: Minus,
      color: 'text-yellow-400',
      description: 'Need fewer than planned',
      disabled: constraints.maxDecrease <= 0,
      disabledReason: 'All qty ordered or installed'
    },
    {
      type: ACTION_TYPES.CANCEL_UNORDERED_QTY,
      label: 'Cancel Unordered',
      icon: X,
      color: 'text-red-400',
      description: 'Remove qty not yet on order',
      disabled: constraints.maxCancelUnordered <= 0,
      disabledReason: 'Nothing unordered'
    },
    {
      type: ACTION_TYPES.REALLOCATE_TO_PROJECT,
      label: 'Move to Project',
      icon: ArrowRightLeft,
      color: 'text-blue-400',
      description: 'Transfer to another build',
      disabled: constraints.maxMove <= 0 || otherProjects.length === 0,
      disabledReason: constraints.maxMove <= 0 ? 'All qty installed' : 'No other projects'
    },
    {
      type: ACTION_TYPES.SPLIT_COMMITMENT,
      label: 'Split',
      icon: Scissors,
      color: 'text-purple-400',
      description: 'Create a separate line item',
      disabled: constraints.maxSplit <= 0,
      disabledReason: 'Need at least 2 qty to split'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Part Info Header */}
      <div className="flex items-center gap-3">
        {part?.featured_photo && (
          <img src={part.featured_photo} alt="" className="w-12 h-12 rounded object-contain bg-gray-800" />
        )}
        <div>
          <h3 className="text-white font-medium">{part?.part_name || 'Unknown Part'}</h3>
          <p className="text-sm text-gray-500">{part?.vendor_part_number}</p>
        </div>
      </div>

      {/* Quantity State Matrix */}
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm text-gray-400">Quantity Status</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <QuantityStateMatrix commitment={safeCommitment} />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        {actions.map(action => {
          const Icon = action.icon;
          const isActive = activeAction === action.type;
          
          return (
            <Button
              key={action.type}
              variant={isActive ? "default" : "outline"}
              className={cn(
                "justify-start gap-2 h-auto py-3",
                isActive ? "bg-gray-700 border-gray-600" : "border-gray-700",
                action.disabled && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => {
                if (!action.disabled) {
                  setActiveAction(isActive ? null : action.type);
                  setImpactPreview(null);
                  setQtyInput(1);
                }
              }}
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : undefined}
            >
              <Icon className={cn("w-4 h-4", action.color)} />
              <div className="text-left">
                <p className="text-sm text-white">{action.label}</p>
                <p className="text-xs text-gray-500">{action.description}</p>
              </div>
            </Button>
          );
        })}
      </div>

      {/* Action Configuration */}
      {activeAction && (
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-4 space-y-4">
            {/* Qty Input */}
            <div className="space-y-2">
              <Label className="text-gray-400">Quantity</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="border-gray-700"
                  onClick={() => setQtyInput(Math.max(1, qtyInput - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center bg-gray-900 border-gray-700 text-white"
                  min={1}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="border-gray-700"
                  onClick={() => setQtyInput(qtyInput + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Max indicator */}
              {activeAction === ACTION_TYPES.DECREASE_QTY && (
                <p className="text-xs text-gray-500">Max: {constraints.maxDecrease}</p>
              )}
              {activeAction === ACTION_TYPES.CANCEL_UNORDERED_QTY && (
                <p className="text-xs text-gray-500">Max: {constraints.maxCancelUnordered}</p>
              )}
              {activeAction === ACTION_TYPES.SPLIT_COMMITMENT && (
                <p className="text-xs text-gray-500">Max: {constraints.maxSplit}</p>
              )}
              {activeAction === ACTION_TYPES.REALLOCATE_TO_PROJECT && (
                <p className="text-xs text-gray-500">Max: {constraints.maxMove}</p>
              )}
            </div>

            {/* Project selector for reallocation */}
            {activeAction === ACTION_TYPES.REALLOCATE_TO_PROJECT && (
              <div className="space-y-2">
                <Label className="text-gray-400">Target Project</Label>
                <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                  <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    {otherProjects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label className="text-gray-400">Reason</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Document reason for this change..."
                className="bg-gray-900 border-gray-700 text-white"
                rows={2}
              />
            </div>

            {/* Preview button */}
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending || (activeAction === ACTION_TYPES.REALLOCATE_TO_PROJECT && !targetProjectId)}
              className="w-full border-gray-700"
            >
              {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Preview Changes
            </Button>

            {/* Impact Preview — simplified */}
            {impactPreview && (
              <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Quantity</span>
                  <span className="text-white">
                    {impactPreview.current.qty} → <span className="font-bold">{impactPreview.proposed.qty}</span>
                  </span>
                </div>

                {impactPreview.delta.cost_total !== 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Project cost change</span>
                    <span className={impactPreview.delta.cost_total >= 0 ? 'text-red-400 font-mono' : 'text-green-400 font-mono'}>
                      {impactPreview.delta.cost_total >= 0 ? '+' : ''}${impactPreview.delta.cost_total.toFixed(2)}
                    </span>
                  </div>
                )}

                {impactPreview.delta.retail_total !== 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Client total change</span>
                    <span className={impactPreview.delta.retail_total >= 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                      {impactPreview.delta.retail_total >= 0 ? '+' : ''}${impactPreview.delta.retail_total.toFixed(2)}
                    </span>
                  </div>
                )}

                {impactPreview.meta.warnings.length > 0 && (
                  <div className="flex items-start gap-2 text-yellow-400 text-xs mt-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{impactPreview.meta.warnings.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Execute button */}
            <Button
              onClick={handleExecute}
              disabled={
                executeMutation.isPending || 
                !impactPreview?.canProceed ||
                (activeAction === ACTION_TYPES.REALLOCATE_TO_PROJECT && !targetProjectId)
              }
              className="w-full bg-red-600 hover:bg-red-700"
            >
              {executeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Confirm
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}