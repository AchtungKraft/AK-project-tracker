import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * EditPoolModal - Edit pool name, invoiced amount, and notes
 */
export default function EditPoolModal({ pool, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [poolName, setPoolName] = useState(pool.pool_name);
  const [invoicedAmount, setInvoicedAmount] = useState(pool.invoiced_amount || 0);
  const [paidAmount, setPaidAmount] = useState(pool.paid_amount || 0);
  const [notes, setNotes] = useState(pool.notes || '');

  const updateMutation = useMutation({
    mutationFn: async () => {
      return base44.entities.BillingPool.update(pool.id, {
        pool_name: poolName.trim(),
        invoiced_amount: invoicedAmount,
        paid_amount: paidAmount,
        notes: notes.trim() || undefined,
        // Recalculate balance
        balance: paidAmount - (pool.allocated_total || 0) - (pool.charges_total || 0),
        // Update status based on payment
        status: paidAmount >= invoicedAmount && invoicedAmount > 0 ? 'paid' : 
                invoicedAmount > 0 ? 'invoiced' : 'draft'
      });
    },
    onSuccess: async () => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        projectIds: pool?.project_id ? [pool.project_id] : [],
      });
      toast.success('Pool updated successfully');
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
    }
  });

  const canSubmit = poolName.trim().length > 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Edit className="w-5 h-5 text-blue-400" />
            Edit Pool
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-gray-300">Pool Name</Label>
            <Input
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-300">Invoiced Amount</Label>
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
            </div>
            <div>
              <Label className="text-gray-300">Paid Amount</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  className="bg-gray-800 border-gray-600 text-white pl-7"
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-gray-800 border-gray-600 text-white mt-1 h-20"
              placeholder="Optional notes..."
            />
          </div>

          {/* Preview */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">New Balance</span>
              <span className={paidAmount - (pool.allocated_total || 0) - (pool.charges_total || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${(paidAmount - (pool.allocated_total || 0) - (pool.charges_total || 0)).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className="text-white">
                {paidAmount >= invoicedAmount && invoicedAmount > 0 ? 'Paid' : 
                 invoicedAmount > 0 ? 'Invoiced' : 'Draft'}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!canSubmit || updateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}