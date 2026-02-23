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
  
  // Guard against undefined commitment
  if (!commitment) return null;

  // Use canonical supply action dispatcher
  const mutation = useMutation({
    mutationFn: async ({ action_type, qty_delta, reason }) => {
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
    onSuccess: (data) => {
      toast.success(`Requirement updated to ${data.required_total}`);
      
      queryClient.invalidateQueries({ queryKey: ['projectCommitments'] });
      queryClient.invalidateQueries({ queryKey: ['commitmentState'] });
      queryClient.invalidateQueries({ queryKey: ['commitmentStates'] });
      queryClient.invalidateQueries({ queryKey: ['lifecycleActionQueue'] });
      queryClient.invalidateQueries({ queryKey: ['coverageDiagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['globalOrderQueue'] });
      queryClient.invalidateQueries({ queryKey: ['globalSupplyQueues'] });
      queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] });
      queryClient.invalidateQueries({ queryKey: ['partSupplyUsage'] });
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
    [ACTION_TYPES.INCREASE_QTY]: 'Increase Quantity',
    [ACTION_TYPES.DECREASE_QTY]: 'Decrease Quantity',
    [ACTION_TYPES.REALLOCATE_TO_PROJECT]: 'Move to Project',
    [ACTION_TYPES.CANCEL_UNORDERED_QTY]: 'Cancel Unordered',
    [ACTION_TYPES.SPLIT_COMMITMENT]: 'Split Commitment'
  };

  if (!action) return null;

  const unitRetail = commitment?.unit_retail_snapshot || 0;
  const retailImpact = action.qty_delta * unitRetail * (action.action_type === ACTION_TYPES.INCREASE_QTY ? 1 : -1);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            {actionLabels[action.action_type]}
          </DialogTitle>
          <DialogDescription>
            Confirm this change to commitment quantity
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Current Qty</span>
              <span className="text-white">{commitment?.required_total ?? commitment?.qty_committed ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Change</span>
              <span className={action.action_type === ACTION_TYPES.INCREASE_QTY ? 'text-green-400' : 'text-red-400'}>
                {action.action_type === ACTION_TYPES.INCREASE_QTY ? '+' : '-'}{action.qty_delta}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
              <span className="text-gray-400">New Qty</span>
              <span className="text-white font-bold">
                {(commitment?.required_total ?? commitment?.qty_committed ?? 0) + (action.action_type === ACTION_TYPES.INCREASE_QTY ? action.qty_delta : -action.qty_delta)}
              </span>
            </div>
          </div>

          {/* Financial impact */}
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="text-gray-400">Retail Impact:</span>
            <span className={retailImpact >= 0 ? 'text-green-400' : 'text-red-400'}>
              {retailImpact >= 0 ? '+' : ''}${retailImpact.toFixed(2)}
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-400">Reason (optional)</Label>
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
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
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
export default function CommitmentQuantityManager({ 
  commitment, 
  part,
  onClose, 
  onSuccess 
}) {
  // Guard against undefined commitment
  if (!commitment) {
    return (
      <div className="p-4 text-center text-gray-400">
        No commitment selected
      </div>
    );
  }
  
  const [activeAction, setActiveAction] = useState(null);
  const [qtyInput, setQtyInput] = useState(1);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [reason, setReason] = useState('');
  const [impactPreview, setImpactPreview] = useState(null);
  const queryClient = useQueryClient();

  // Fetch projects for reallocation
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const otherProjects = projects.filter(p => p.id !== commitment?.project_id);

  // Dry run mutation for impact preview - use canonical dispatcher
  const previewMutation = useMutation({
    mutationFn: async (params) => {
      const currentRequired = commitment?.required_total ?? commitment?.qty_committed ?? 0;
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
        commitment_ids: [commitment.id],
        payload: { required_total_set: newRequired },
        dry_run: true
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.preview) {
        setImpactPreview({
          old_qty: data.preview.old_required,
          new_qty: data.preview.new_required,
          delta: data.preview.delta,
          reserved: data.preview.new_reserved,
          to_order: data.preview.to_order,
          coverage_status: data.preview.coverage_status
        });
      }
    }
  });

  // Execute mutation - use canonical dispatcher
  const executeMutation = useMutation({
    mutationFn: async (params) => {
      const currentRequired = commitment?.required_total ?? commitment?.qty_committed ?? 0;
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
        commitment_ids: [commitment.id],
        payload: { required_total_set: newRequired },
        dry_run: false
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Requirement updated to ${data.required_total}`);
        queryClient.invalidateQueries({ queryKey: ['projectCommitments'] });
        queryClient.invalidateQueries({ queryKey: ['projectSupplyView'] });
        queryClient.invalidateQueries({ queryKey: ['partSupplyUsage'] });
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
    if (!activeAction) return;
    
    previewMutation.mutate({
      commitment_id: commitment.id,
      action_type: activeAction,
      qty_delta: qtyInput,
      target_project_id: targetProjectId || undefined
    });
  };

  const handleExecute = () => {
    if (!activeAction) return;

    executeMutation.mutate({
      commitment_id: commitment.id,
      action_type: activeAction,
      qty_delta: qtyInput,
      target_project_id: targetProjectId || undefined,
      reason
    });
  };

  // Calculate constraints - use canonical fields with legacy fallback
  const constraints = useMemo(() => {
    if (!commitment) return {};
    
    const required_total = commitment.required_total ?? commitment.qty_committed ?? 0;
    const covered_from_po = commitment.covered_from_po ?? commitment.qty_ordered ?? 0;
    const qty_installed = commitment.qty_installed ?? 0;
    
    return {
      maxDecrease: required_total - Math.max(covered_from_po, qty_installed),
      maxCancelUnordered: Math.max(0, required_total - (commitment.reserved_from_stock ?? 0) - covered_from_po), // gap
      maxSplit: required_total - 1,
      maxMove: required_total - qty_installed
    };
  }, [commitment]);

  const actions = [
    {
      type: ACTION_TYPES.INCREASE_QTY,
      label: 'Add More',
      icon: Plus,
      color: 'text-green-400',
      description: 'Increase committed quantity'
    },
    {
      type: ACTION_TYPES.DECREASE_QTY,
      label: 'Reduce',
      icon: Minus,
      color: 'text-yellow-400',
      description: 'Decrease committed quantity',
      disabled: constraints.maxDecrease <= 0,
      disabledReason: 'All qty ordered or installed'
    },
    {
      type: ACTION_TYPES.CANCEL_UNORDERED_QTY,
      label: 'Cancel Unordered',
      icon: X,
      color: 'text-red-400',
      description: 'Cancel qty not yet on order',
      disabled: constraints.maxCancelUnordered <= 0,
      disabledReason: 'No unordered qty'
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
      description: 'Create separate commitment',
      disabled: constraints.maxSplit <= 0,
      disabledReason: 'Need at least 2 qty to split'
    }
  ];

  if (!commitment) return null;

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
          <QuantityStateMatrix commitment={commitment} />
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
              Preview Impact
            </Button>

            {/* Impact Preview */}
            {impactPreview && (
              <div className="space-y-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                <h4 className="text-sm font-medium text-gray-400">Impact Preview</h4>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500">Current Qty</p>
                    <p className="text-white">{impactPreview.current.required_total ?? impactPreview.current.qty_committed}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">New Qty</p>
                    <p className="text-white font-bold">{impactPreview.proposed.required_total ?? impactPreview.proposed.qty_committed}</p>
                  </div>
                </div>

                {/* Financial impact */}
                <div className="grid grid-cols-2 gap-2 text-sm border-t border-gray-800 pt-2">
                  <div>
                    <p className="text-gray-500">Retail Change</p>
                    <p className={impactPreview.financialImpact.retail_delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {impactPreview.financialImpact.retail_delta >= 0 ? '+' : ''}
                      ${impactPreview.financialImpact.retail_delta.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Margin Impact</p>
                    <p className={impactPreview.financialImpact.margin_impact >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {impactPreview.financialImpact.margin_impact >= 0 ? '+' : ''}
                      ${impactPreview.financialImpact.margin_impact.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Warnings */}
                {impactPreview.warnings?.length > 0 && (
                  <div className="flex items-start gap-2 text-yellow-400 text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>{impactPreview.warnings.join(', ')}</div>
                  </div>
                )}

                {/* Blocking issues */}
                {impactPreview.blockingIssues?.length > 0 && (
                  <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 p-2 rounded">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>{impactPreview.blockingIssues.join(', ')}</div>
                  </div>
                )}

                {/* Flags */}
                {impactPreview.proposedFlags?.credit_required && (
                  <Badge variant="outline" className="border-yellow-600 text-yellow-400">
                    Credit Adjustment Required
                  </Badge>
                )}
                {impactPreview.proposedFlags?.po_adjustment_required && (
                  <Badge variant="outline" className="border-purple-600 text-purple-400">
                    PO Adjustment Required
                  </Badge>
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
              Confirm Change
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}