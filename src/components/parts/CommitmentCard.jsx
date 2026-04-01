import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, MoreHorizontal, FileText, ShoppingCart, RotateCcw, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAllowedCommitmentActions, getActionBlockReason } from "../lifecycle/getAllowedCommitmentActions";
import DeltaOrderModal from "./DeltaOrderModal";
import { getDisplayStatus, getDisplayStatusColor } from "@/components/supply/lifecycleDisplay";
import PricingIntegrityBadge from "@/components/supply/PricingIntegrityBadge";
import CostSourceBadge from "@/components/supply/CostSourceBadge";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import { cn } from "@/lib/utils";

/**
 * CommitmentCard - Displays a single PartCommitment record
 */
export default function CommitmentCard({ 
  commitment, 
  part, 
  project,
  orders = [],
  onEdit,
  onCancel,
  onViewPO,
  onCreatePO,
  onReverseInstall,
  compact = false,
  financialStatus = null,
}) {
  const [showDeltaOrderModal, setShowDeltaOrderModal] = useState(false);

  const linkedOrders = orders.filter(o => 
    (commitment.order_line_item_ids || []).some(liId => 
      o.lineItems?.some(li => li.id === liId)
    )
  );

  const remaining = Math.max(0, 
    (commitment.qty_committed || 0) - 
    (commitment.qty_installed || 0) - 
    (commitment.qty_cancelled || 0)
  );

  // Use centralized lifecycle gating
  const allowedActions = getAllowedCommitmentActions(commitment);

  const displayStatus = getDisplayStatus(commitment.commitment_status);
  const statusColor = getDisplayStatusColor(displayStatus);

  if (compact) {
    return (
      <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded-lg border border-gray-700/50">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-mono uppercase px-1.5 py-0.5 border-l-2 bg-gray-900/50",
            statusColor
          )}>
            {displayStatus}
          </span>
          <span className="text-sm text-gray-300 font-mono">
            {commitment.qty_installed || 0}/{commitment.qty_committed || 0}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {commitment.qty_ordered > 0 && (
            <span className="text-gray-400 font-mono">
              {commitment.qty_received || 0}/{commitment.qty_ordered} recv
            </span>
          )}
          <PricingIntegrityBadge commitment={commitment} />
        </div>
      </div>
    );
  }

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header - AK Industrial: simplified status display */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={cn(
                "text-[10px] font-mono uppercase px-2 py-0.5 border-l-2 bg-gray-900/50",
                statusColor
              )}>
                {displayStatus}
              </span>
              <PricingIntegrityBadge commitment={commitment} />
            </div>

            {/* Part Info */}
            {part && (
              <div className="flex items-center gap-2 mb-2">
                {part.featured_photo ? (
                  <img src={part.featured_photo} alt="" className="w-8 h-8 rounded object-contain bg-gray-800" />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center">
                    <Package className="w-4 h-4 text-gray-600" />
                  </div>
                )}
                <div>
                  <p className="text-white text-sm font-medium">{part.part_name}</p>
                  {part.vendor_part_number && (
                    <p className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</p>
                  )}
                </div>
              </div>
            )}

            {/* Cost + Retail Row */}
            <div className="flex items-center gap-4 mb-2 text-xs">
              <span className="text-gray-500">
                C: <span className="text-gray-300 font-mono">{formatCurrencyUSD(commitment.unit_cost_snapshot || part?.cost || 0)}</span>
              </span>
              <span className="text-gray-500">
                R: <span className="text-gray-300 font-mono">{formatCurrencyUSD(commitment.unit_retail_snapshot || 0)}</span>
              </span>
              <CostSourceBadge commitment={commitment} />
            </div>

            {/* Quantity Grid - AK Industrial: monochrome */}
            <div className="grid grid-cols-4 gap-2 text-center mt-3">
              <div className="p-1.5 bg-gray-800/40 rounded">
                <p className="text-[10px] text-gray-500 uppercase">Committed</p>
                <p className="text-sm font-mono text-white">{commitment.qty_committed || 0}</p>
              </div>
              <div className="p-1.5 bg-gray-800/40 rounded">
                <p className="text-[10px] text-gray-500 uppercase">Ordered</p>
                <p className="text-sm font-mono text-gray-300">{commitment.qty_ordered || 0}</p>
              </div>
              <div className="p-1.5 bg-gray-800/40 rounded">
                <p className="text-[10px] text-gray-500 uppercase">Received</p>
                <p className="text-sm font-mono text-gray-300">{commitment.qty_received || 0}</p>
              </div>
              <div className="p-1.5 bg-gray-800/40 rounded">
                <p className="text-[10px] text-gray-500 uppercase">Installed</p>
                <p className="text-sm font-mono text-gray-300">{commitment.qty_installed || 0}</p>
              </div>
            </div>

            {/* Linked POs */}
            {(commitment.order_line_item_ids || []).length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <FileText className="w-3 h-3 text-gray-500" />
                <span className="text-xs text-gray-400 font-mono">
                  {(commitment.order_line_item_ids || []).length} PO line(s)
                </span>
              </div>
            )}

            {/* Notes */}
            {commitment.notes && (
              <p className="text-xs text-gray-500 mt-2 italic">{commitment.notes}</p>
            )}
          </div>

          {/* Actions */}
          <TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
                {onEdit && allowedActions.canEdit && (
                  <DropdownMenuItem onClick={() => onEdit(commitment)}>
                    Edit Commitment
                  </DropdownMenuItem>
                )}
                
                {/* Create PO - only when allowed by lifecycle */}
                {onCreatePO && allowedActions.canCreatePO && (
                  <DropdownMenuItem onClick={() => onCreatePO(commitment)}>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Create PO
                  </DropdownMenuItem>
                )}
                
                {/* Show disabled PO option with reason if not allowed but handler exists */}
                {onCreatePO && !allowedActions.canCreatePO && commitment.commitment_status !== 'cancelled' && !allowedActions.canCreateDeltaOrder && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem disabled className="text-gray-500">
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Create PO
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent>
                      {getActionBlockReason(commitment, 'canCreatePO')}
                    </TooltipContent>
                  </Tooltip>
                )}
                
                {/* Delta Order - visible when commitment has existing orders */}
                {allowedActions.canCreateDeltaOrder && (
                  <DropdownMenuItem onClick={() => setShowDeltaOrderModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Additional Order
                  </DropdownMenuItem>
                )}
                
                {onViewPO && (commitment.order_line_item_ids || []).length > 0 && (
                  <DropdownMenuItem onClick={() => onViewPO(commitment)}>
                    View Linked POs
                  </DropdownMenuItem>
                )}
                
                {/* Reverse Installation - only when allowed */}
                {onReverseInstall && allowedActions.canReverseInstall && (
                  <>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    <DropdownMenuItem 
                      onClick={() => onReverseInstall(commitment)}
                      className="text-orange-400"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reverse Installation
                    </DropdownMenuItem>
                  </>
                )}
                
                {/* Cancel - only when allowed by lifecycle */}
                {onCancel && allowedActions.canCancel && (
                  <>
                    <DropdownMenuSeparator className="bg-gray-700" />
                    <DropdownMenuItem 
                      onClick={() => onCancel(commitment)}
                      className="text-red-400"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {allowedActions.cancelRequiresInventoryReturn 
                        ? 'Cancel (Requires Inventory Return)'
                        : 'Cancel Commitment'
                      }
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        </div>
      </CardContent>

      {/* Delta Order Modal */}
      {showDeltaOrderModal && (
        <DeltaOrderModal
          commitment={commitment}
          part={part}
          onClose={() => setShowDeltaOrderModal(false)}
        />
      )}
    </Card>
  );
}