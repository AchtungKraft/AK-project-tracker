import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CommitmentStatusBadge, 
  CommitmentBillingBadge, 
  CommitmentSourceBadge 
} from "./CommitmentStatusBadge";
import { Package, MoreHorizontal, FileText, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FinancialStatusBadge from "../financial/FinancialStatusBadge";

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
  compact = false,
  financialStatus = null,
}) {
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

  if (compact) {
    return (
      <div className="flex items-center justify-between p-2 bg-gray-800/30 rounded-lg border border-gray-700/50">
        <div className="flex items-center gap-2">
          <CommitmentStatusBadge status={commitment.commitment_status} size="sm" />
          <span className="text-sm text-gray-300">
            {commitment.qty_installed || 0}/{commitment.qty_committed || 0}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {commitment.qty_ordered > 0 && (
            <span className="text-purple-400">
              {commitment.qty_received || 0}/{commitment.qty_ordered} recv
            </span>
          )}
          <FinancialStatusBadge financialStatus={financialStatus} displayMode="compact" />
        </div>
      </div>
    );
  }

  return (
    <Card className="bg-gray-900/50 border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <CommitmentStatusBadge status={commitment.commitment_status} />
              <CommitmentSourceBadge source={commitment.allocation_source} />
            </div>
            
            {/* Financial Status */}
            <div className="mb-2">
              <FinancialStatusBadge financialStatus={financialStatus} displayMode="full" />
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

            {/* Quantity Grid */}
            <div className="grid grid-cols-4 gap-2 text-center mt-3">
              <div className="p-1.5 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-500">Committed</p>
                <p className="text-sm font-bold text-white">{commitment.qty_committed || 0}</p>
              </div>
              <div className="p-1.5 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-500">Ordered</p>
                <p className="text-sm font-bold text-purple-400">{commitment.qty_ordered || 0}</p>
              </div>
              <div className="p-1.5 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-500">Allocated</p>
                <p className="text-sm font-bold text-blue-400">{commitment.qty_allocated || 0}</p>
              </div>
              <div className="p-1.5 bg-gray-800/50 rounded">
                <p className="text-xs text-gray-500">Installed</p>
                <p className="text-sm font-bold text-green-400">{commitment.qty_installed || 0}</p>
              </div>
            </div>

            {/* Linked POs */}
            {(commitment.order_line_item_ids || []).length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <FileText className="w-3 h-3 text-gray-500" />
                <span className="text-xs text-gray-400">
                  {(commitment.order_line_item_ids || []).length} linked PO line(s)
                </span>
              </div>
            )}

            {/* Notes */}
            {commitment.notes && (
              <p className="text-xs text-gray-500 mt-2 italic">{commitment.notes}</p>
            )}
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(commitment)}>
                  Edit Commitment
                </DropdownMenuItem>
              )}
              {onViewPO && (commitment.order_line_item_ids || []).length > 0 && (
                <DropdownMenuItem onClick={() => onViewPO(commitment)}>
                  View Linked POs
                </DropdownMenuItem>
              )}
              {onCancel && commitment.commitment_status !== 'cancelled' && commitment.commitment_status !== 'installed' && (
                <>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem 
                    onClick={() => onCancel(commitment)}
                    className="text-red-400"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Cancel Commitment
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}