import React, { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DollarSign, Plus, Loader2, Ban } from "lucide-react";
import { CommitmentActions } from "./financialMutationGuard";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * CreatePoolModal - Create a new billing pool for a project
 * 
 * NOTE: This modal is LEGACY MODEL ONLY.
 * Forward model projects should NOT render this modal.
 * Forward model uses InvoiceBatch for revenue tracking, not billing pools.
 * 
 * HARD BLOCK: If project.financial_model_version === 'forward', this modal
 * will render a blocked state and NOT allow pool creation.
 * 
 * Always visible from PoolPanel (no lifecycle restriction)
 * Routes through CommitmentActions.createBillingPool()
 */
export default function CreatePoolModal({ projectId, project, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [poolName, setPoolName] = useState("Main Pool");
  const [invoicedAmount, setInvoicedAmount] = useState(0);
  const [notes, setNotes] = useState("");

  // ============================================
  // HARD BLOCK: Forward model projects cannot use BillingPool
  // ============================================
  const { data: fetchedProject } = useQuery({
    queryKey: ['project-for-pool', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0] || null;
    },
    enabled: !project && !!projectId,
  });

  const effectiveProject = project || fetchedProject;
  const isForwardModel = effectiveProject?.financial_model_version === 'forward';

  const canSubmit = poolName.trim().length > 0;

  const createPoolMutation = useMutation({
    mutationFn: async () => {
      return await CommitmentActions.createBillingPool({
        project_id: projectId,
        pool_name: poolName.trim(),
        invoiced_amount: invoicedAmount || 0,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async (result) => {
      await forceAppRefresh(queryClient, {
        projectIds: [projectId],
      });
      toast.success(`Pool "${poolName}" created successfully`);
      onSuccess?.(result);
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to create pool: ' + error.message);
    },
  });

  const handleSubmit = () => {
    if (!canSubmit) return;
    createPoolMutation.mutate();
  };

  // HARD BLOCK: Render blocked UI for forward projects (after all hooks)
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
              Billing Pools are not available for forward model projects.
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Create Billing Pool
          </DialogTitle>
          <DialogDescription>
            Create a new billing pool for tracking project invoices.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-gray-300">Pool Name *</Label>
            <Input
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              placeholder="e.g., Main Pool, Deposit Pool"
              className="bg-gray-800 border-gray-600 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-gray-300">Initial Invoiced Amount</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={invoicedAmount}
                onChange={(e) => setInvoicedAmount(parseFloat(e.target.value) || 0)}
                className="bg-gray-800 border-gray-600 text-white pl-7"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Optional: Set initial invoiced amount (can be updated later)
            </p>
          </div>

          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this pool..."
              className="bg-gray-800 border-gray-600 text-white mt-1 h-20"
            />
          </div>

          {/* Info Box */}
          <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <p className="text-sm text-blue-300">
              A billing pool tracks client payments and allocates funds to commitments.
            </p>
            <ul className="text-xs text-gray-400 mt-2 space-y-1 list-disc list-inside">
              <li>Pool starts in "draft" status</li>
              <li>Allocations draw down the pool balance</li>
              <li>Pool can be closed when balance reaches $0</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createPoolMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {createPoolMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Pool
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}