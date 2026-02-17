import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CommitmentActions } from "@/components/financial/financialMutationGuard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { 
  MoreVertical, Edit, ArrowRightLeft, XCircle, DollarSign, RefreshCw 
} from "lucide-react";
import { toast } from "sonner";
import EditPoolModal from "./EditPoolModal";
import TransferPoolBalanceModal from "./TransferPoolBalanceModal";
import ClosePoolModal from "./ClosePoolModal";

/**
 * PoolActionsMenu - Actions dropdown for billing pools
 * 
 * Actions:
 * - Edit Pool (name/status)
 * - Transfer Balance
 * - Close Pool
 * - Recalculate Balance
 */
export default function PoolActionsMenu({ 
  pool, 
  disabled = false,
  onRefresh 
}) {
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return CommitmentActions.recalculatePoolBalance({ pool_id: pool.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectPools'] });
      queryClient.invalidateQueries({ queryKey: ['billingPools'] });
      toast.success('Pool balance recalculated');
      onRefresh?.();
    },
    onError: (error) => {
      toast.error(`Recalculation failed: ${error.message}`);
    }
  });

  const canEdit = ['draft', 'invoiced', 'paid'].includes(pool.status);
  const canTransfer = pool.balance > 0 && pool.status !== 'closed';
  const canClose = pool.status !== 'closed';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            disabled={disabled}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
          {canEdit && (
            <DropdownMenuItem 
              onClick={() => setShowEditModal(true)}
              className="text-gray-300"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Pool
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem 
            onClick={() => recalculateMutation.mutate()}
            disabled={recalculateMutation.isPending}
            className="text-blue-400"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
            Recalculate Balance
          </DropdownMenuItem>

          {canTransfer && (
            <DropdownMenuItem 
              onClick={() => setShowTransferModal(true)}
              className="text-green-400"
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Transfer Balance
            </DropdownMenuItem>
          )}

          {canClose && (
            <>
              <DropdownMenuSeparator className="bg-gray-700" />
              <DropdownMenuItem 
                onClick={() => setShowCloseModal(true)}
                className="text-red-400"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Close Pool
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      {showEditModal && (
        <EditPoolModal
          pool={pool}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            onRefresh?.();
          }}
        />
      )}

      {showTransferModal && (
        <TransferPoolBalanceModal
          sourcePool={pool}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => {
            setShowTransferModal(false);
            onRefresh?.();
          }}
        />
      )}

      {showCloseModal && (
        <ClosePoolModal
          pool={pool}
          onClose={() => setShowCloseModal(false)}
          onSuccess={() => {
            setShowCloseModal(false);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}