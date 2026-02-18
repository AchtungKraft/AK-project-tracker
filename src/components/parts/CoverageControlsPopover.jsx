import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { 
  Package, 
  PackageMinus, 
  ShoppingCart, 
  ShoppingCartIcon,
  Undo2,
  Loader2,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 9.7d — Coverage Controls Popover
 * 
 * Provides explicit row-level actions for commitment coverage:
 * - Reserve From Stock
 * - Release Reservation
 * - Add To Order Queue
 * - Remove From Order Queue
 * - Undo Last Action
 */

const ACTION_CONFIGS = {
  RESERVE_STOCK: {
    label: "Reserve Stock",
    shortLabel: "Reserve",
    icon: Package,
    color: "text-cyan-400",
    bgColor: "bg-cyan-600 hover:bg-cyan-500",
    description: "Reserve from available inventory"
  },
  RELEASE_RESERVATION: {
    label: "Release Reservation",
    shortLabel: "Release",
    icon: PackageMinus,
    color: "text-orange-400",
    bgColor: "bg-orange-600 hover:bg-orange-500",
    description: "Release previously reserved stock"
  },
  ADD_TO_ORDER_QUEUE: {
    label: "Add to Order",
    shortLabel: "+Order",
    icon: ShoppingCart,
    color: "text-purple-400",
    bgColor: "bg-purple-600 hover:bg-purple-500",
    description: "Increase qty needed (adds to order queue)"
  },
  REMOVE_FROM_ORDER_QUEUE: {
    label: "Remove from Order",
    shortLabel: "-Order",
    icon: ShoppingCartIcon,
    color: "text-red-400",
    bgColor: "bg-red-600 hover:bg-red-500",
    description: "Decrease qty needed (removes from order queue)"
  }
};

function ActionButton({ action, onClick, disabled, loading }) {
  const config = ACTION_CONFIGS[action];
  const Icon = config.icon;
  
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onClick(action)}
      disabled={disabled || loading}
      className={cn(
        "flex-1 gap-1 text-xs h-8",
        "border-gray-600 bg-gray-800 hover:bg-gray-700",
        config.color
      )}
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      {config.shortLabel}
    </Button>
  );
}

function ActionConfirmPopover({ 
  action, 
  commitment, 
  onConfirm, 
  onCancel,
  maxQty,
  loading 
}) {
  const [qty, setQty] = useState(1);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const config = ACTION_CONFIGS[action];
  const Icon = config.icon;
  
  const fetchPreview = async (quantity) => {
    if (!quantity || quantity <= 0) return;
    
    setPreviewLoading(true);
    try {
      const result = await base44.functions.invoke('executeCommitmentCoverageAction', {
        commitment_id: commitment.id,
        action_type: action,
        qty: quantity,
        dry_run: true
      });
      
      if (result.data?.ok && result.data?.preview) {
        setPreview(result.data.preview);
      } else {
        setPreview({ error: result.data?.error || 'Preview failed' });
      }
    } catch (err) {
      setPreview({ error: err.message });
    } finally {
      setPreviewLoading(false);
    }
  };
  
  const handleQtyChange = (value) => {
    const newQty = Math.max(1, Math.min(parseInt(value) || 1, maxQty || 999));
    setQty(newQty);
    fetchPreview(newQty);
  };
  
  // Fetch initial preview
  React.useEffect(() => {
    fetchPreview(1);
  }, []);
  
  return (
    <div className="space-y-3 p-1">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <Icon className={cn("w-4 h-4", config.color)} />
        {config.label}
      </div>
      
      <p className="text-xs text-gray-400">{config.description}</p>
      
      <div className="space-y-2">
        <Label className="text-xs text-gray-300">Quantity</Label>
        <Input
          type="number"
          min={1}
          max={maxQty || 999}
          value={qty}
          onChange={(e) => handleQtyChange(e.target.value)}
          className="h-8 text-sm"
        />
        {maxQty && (
          <p className="text-xs text-gray-500">Max: {maxQty}</p>
        )}
      </div>
      
      {/* Preview Panel */}
      {previewLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading preview...
        </div>
      )}
      
      {preview && !previewLoading && (
        <div className="rounded bg-gray-800/50 p-2 space-y-1 text-xs">
          {preview.error ? (
            <div className="flex items-center gap-1 text-red-400">
              <AlertCircle className="w-3 h-3" />
              {preview.error}
            </div>
          ) : (
            <>
              <div className="text-gray-400 border-b border-gray-700 pb-1 mb-1">Impact Preview</div>
              {preview.old_state && preview.new_state && (
                <div className="grid grid-cols-3 gap-1 text-gray-300">
                  <span></span>
                  <span className="text-gray-500">Before</span>
                  <span className="text-gray-500">After</span>
                  
                  {preview.new_state.qty_reserved !== undefined && (
                    <>
                      <span className="text-cyan-400">Reserved</span>
                      <span>{preview.old_state.qty_reserved ?? '-'}</span>
                      <span className="text-white font-medium">{preview.new_state.qty_reserved}</span>
                    </>
                  )}
                  
                  {preview.new_state.qty_to_order !== undefined && (
                    <>
                      <span className="text-purple-400">To Order</span>
                      <span>{preview.old_state.qty_to_order ?? '-'}</span>
                      <span className="text-white font-medium">{preview.new_state.qty_to_order}</span>
                    </>
                  )}
                  
                  {preview.new_state.qty_committed !== undefined && (
                    <>
                      <span className="text-blue-400">Committed</span>
                      <span>{preview.old_state.qty_committed ?? '-'}</span>
                      <span className="text-white font-medium">{preview.new_state.qty_committed}</span>
                    </>
                  )}
                </div>
              )}
              
              {preview.coverage && (
                <div className="pt-1 mt-1 border-t border-gray-700">
                  <span className="text-gray-400">New Status: </span>
                  <span className={cn(
                    "font-medium",
                    preview.coverage.coverage_status === 'FULL' && "text-green-400",
                    preview.coverage.coverage_status === 'PARTIAL' && "text-amber-400",
                    preview.coverage.coverage_status === 'NONE' && "text-red-400",
                    preview.coverage.coverage_status === 'OVER' && "text-purple-400"
                  )}>
                    {preview.coverage.coverage_status}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      <div className="flex gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="flex-1 h-8"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onConfirm(qty)}
          disabled={loading || (preview?.error) || previewLoading}
          className={cn("flex-1 h-8", config.bgColor)}
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3 h-3" />
          )}
          Confirm
        </Button>
      </div>
    </div>
  );
}

export function CoverageControlsPopover({ 
  commitment, 
  coverage,
  undoAvailable = false,
  onActionComplete,
  disabled = false 
}) {
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const handleActionSelect = (action) => {
    setSelectedAction(action);
  };
  
  const handleConfirm = async (qty) => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('executeCommitmentCoverageAction', {
        commitment_id: commitment.id,
        action_type: selectedAction,
        qty,
        dry_run: false
      });
      
      if (result.data?.ok) {
        toast.success(`${ACTION_CONFIGS[selectedAction].label} completed`);
        setOpen(false);
        setSelectedAction(null);
        onActionComplete?.();
      } else {
        toast.error(result.data?.error || 'Action failed');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUndo = async () => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('undoLastCommitmentAction', {
        commitment_id: commitment.id
      });
      
      if (result.data?.ok) {
        toast.success(`Undid ${result.data.undone_event_type}`);
        setOpen(false);
        onActionComplete?.();
      } else {
        toast.error(result.data?.error || 'Undo failed');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancel = () => {
    setSelectedAction(null);
  };
  
  // Determine max quantities for each action
  const maxReserve = 999; // Would need inventory check
  const maxRelease = commitment.qty_reserved || 0;
  const maxRemove = Math.max(0, 
    (commitment.qty_committed || 0) - 
    Math.max(commitment.qty_ordered || 0, commitment.qty_received || 0, commitment.qty_installed || 0)
  );
  
  // Determine which actions are available
  const canReserve = coverage?.coverage_status !== 'FULL' && coverage?.coverage_status !== 'OVER';
  const canRelease = (commitment.qty_reserved || 0) > 0;
  const canAddToOrder = true;
  const canRemoveFromOrder = maxRemove > 0;
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 px-2 text-xs border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300"
        >
          Controls
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 bg-gray-900 border-gray-700 p-3"
        align="end"
      >
        {selectedAction ? (
          <ActionConfirmPopover
            action={selectedAction}
            commitment={commitment}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            maxQty={
              selectedAction === 'RELEASE_RESERVATION' ? maxRelease :
              selectedAction === 'REMOVE_FROM_ORDER_QUEUE' ? maxRemove :
              undefined
            }
            loading={loading}
          />
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-medium text-white">Coverage Actions</div>
            
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                action="RESERVE_STOCK"
                onClick={handleActionSelect}
                disabled={!canReserve}
                loading={false}
              />
              <ActionButton
                action="RELEASE_RESERVATION"
                onClick={handleActionSelect}
                disabled={!canRelease}
                loading={false}
              />
              <ActionButton
                action="ADD_TO_ORDER_QUEUE"
                onClick={handleActionSelect}
                disabled={!canAddToOrder}
                loading={false}
              />
              <ActionButton
                action="REMOVE_FROM_ORDER_QUEUE"
                onClick={handleActionSelect}
                disabled={!canRemoveFromOrder}
                loading={false}
              />
            </div>
            
            {undoAvailable && (
              <div className="pt-2 border-t border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={loading}
                  className="w-full gap-2 h-8 text-xs border-blue-600 bg-blue-900/30 hover:bg-blue-800/50 text-blue-400"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Undo2 className="w-3 h-3" />
                  )}
                  Undo Last Action
                </Button>
              </div>
            )}
            
            {/* Current State Summary */}
            <div className="pt-2 border-t border-gray-700 text-xs text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Committed:</span>
                <span className="text-white">{commitment.qty_committed || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Reserved:</span>
                <span className="text-cyan-400">{commitment.qty_reserved || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>To Order:</span>
                <span className="text-purple-400">{commitment.qty_to_order || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Ordered:</span>
                <span className="text-purple-400">{commitment.qty_ordered || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Received:</span>
                <span className="text-blue-400">{commitment.qty_received || 0}</span>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default CoverageControlsPopover;