import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, GitBranch, Package } from "lucide-react";
import { toast } from "sonner";
import { calculateCommitmentState } from "../inventory/commitmentStateEngine";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * SplitCommitmentModal - Split commitment quantity to new or different project
 * 
 * Creates new commitment with split amount, reduces original.
 * Maintains total integrity.
 */
export default function SplitCommitmentModal({ 
  commitment, 
  part,
  currentProject,
  onClose 
}) {
  const queryClient = useQueryClient();
  const [splitQty, setSplitQty] = useState(1);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [splitType, setSplitType] = useState('transfer'); // 'transfer' or 'duplicate'

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  // Calculate max splittable (can't split installed qty)
  const maxSplittable = Math.max(0, 
    (commitment.qty_committed || 0) - (commitment.qty_installed || 0)
  );

  // Active projects only, excluding current
  const availableProjects = projects.filter(p => 
    p.id !== commitment.project_id &&
    p.status_id !== 'completed' && 
    p.status_id !== 'cancelled'
  );

  const splitMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      // Calculate proportional quantities for new commitment
      const originalQty = commitment.qty_committed || 0;
      const proportion = splitQty / originalQty;
      
      const newOrdered = Math.floor((commitment.qty_ordered || 0) * proportion);
      const newReceived = Math.floor((commitment.qty_received || 0) * proportion);
      const newAllocated = Math.floor((commitment.qty_allocated || 0) * proportion);
      
      // Create new commitment
      const newCommitmentStatus = calculateCommitmentState({
        qty_committed: splitQty,
        qty_ordered: newOrdered,
        qty_received: newReceived,
        qty_allocated: newAllocated,
        qty_installed: 0
      });

      const newCommitment = await base44.entities.PartCommitment.create({
        project_id: targetProjectId,
        part_id: part.id,
        parent_commitment_id: commitment.id,
        qty_committed: splitQty,
        qty_ordered: newOrdered,
        qty_received: newReceived,
        qty_allocated: newAllocated,
        qty_installed: 0,
        commitment_status: newCommitmentStatus,
        source_type: 'split_commitment',
        order_line_item_ids: commitment.order_line_item_ids || [],
        unit_cost_snapshot: commitment.unit_cost_snapshot,
        unit_retail_snapshot: commitment.unit_retail_snapshot,
        commitment_version: 1
      });

      // Update original commitment
      const remainingQty = originalQty - splitQty;
      const remainingOrdered = (commitment.qty_ordered || 0) - newOrdered;
      const remainingReceived = (commitment.qty_received || 0) - newReceived;
      const remainingAllocated = (commitment.qty_allocated || 0) - newAllocated;
      
      const updatedStatus = calculateCommitmentState({
        qty_committed: remainingQty,
        qty_ordered: remainingOrdered,
        qty_received: remainingReceived,
        qty_allocated: remainingAllocated,
        qty_installed: commitment.qty_installed || 0
      });

      await base44.entities.PartCommitment.update(commitment.id, {
        qty_committed: remainingQty,
        qty_ordered: remainingOrdered,
        qty_received: remainingReceived,
        qty_allocated: remainingAllocated,
        commitment_status: updatedStatus,
        commitment_version: (commitment.commitment_version || 1) + 1
      });

      // Audit logs
      await base44.entities.CommitmentAuditLog.create({
        commitment_id: commitment.id,
        action_type: 'qty_change',
        previous_values: {
          qty_committed: originalQty,
          qty_ordered: commitment.qty_ordered,
          qty_received: commitment.qty_received,
          qty_allocated: commitment.qty_allocated
        },
        new_values: {
          qty_committed: remainingQty,
          qty_ordered: remainingOrdered,
          split_to: newCommitment.id,
          split_qty: splitQty
        },
        trigger_source: 'manual',
        triggered_by: user.email,
        validation_passed: true
      });

      await base44.entities.CommitmentAuditLog.create({
        commitment_id: newCommitment.id,
        action_type: 'create',
        previous_values: null,
        new_values: {
          project_id: targetProjectId,
          qty_committed: splitQty,
          source_type: 'split_commitment',
          parent_commitment_id: commitment.id
        },
        trigger_source: 'manual',
        triggered_by: user.email,
        validation_passed: true
      });

      return newCommitment;
    },
    onSuccess: async (newCommitment) => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: [part.id],
        projectIds: [commitment.project_id, targetProjectId].filter(Boolean),
        commitmentIds: [commitment.id, newCommitment?.id].filter(Boolean),
      });
      toast.success('Commitment split successfully');
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to split: ${error.message}`);
    }
  });

  const handleSubmit = () => {
    if (!targetProjectId) {
      toast.error('Please select a target project');
      return;
    }
    if (splitQty <= 0 || splitQty > maxSplittable) {
      toast.error(`Quantity must be between 1 and ${maxSplittable}`);
      return;
    }
    splitMutation.mutate();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <GitBranch className="w-5 h-5 text-purple-400" />
            Split Commitment
          </DialogTitle>
          <DialogDescription>
            Split this commitment to transfer quantity to another project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Part Info */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-white font-medium">{part?.part_name}</span>
            </div>
            <div className="text-sm text-gray-400">
              From: {currentProject?.name}
            </div>
          </div>

          {/* Current Quantities */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Committed</p>
              <p className="text-lg font-bold text-white">{commitment.qty_committed || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Ordered</p>
              <p className="text-lg font-bold text-purple-400">{commitment.qty_ordered || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Installed</p>
              <p className="text-lg font-bold text-green-400">{commitment.qty_installed || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Splittable</p>
              <p className="text-lg font-bold text-yellow-400">{maxSplittable}</p>
            </div>
          </div>

          {/* Warning if installed qty exists */}
          {(commitment.qty_installed || 0) > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-yellow-400 font-medium">Installed units cannot be split</p>
                <p className="text-gray-400">
                  {commitment.qty_installed} installed units will remain on this build.
                </p>
              </div>
            </div>
          )}

          {/* Target Project */}
          <div className="space-y-2">
            <Label className="text-gray-300">Transfer to Project</Label>
            <Select value={targetProjectId} onValueChange={setTargetProjectId}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="Select target project..." />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                    {project.client_name && ` - ${project.client_name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Split Quantity */}
          <div className="space-y-2">
            <Label className="text-gray-300">Quantity to Split</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={maxSplittable}
                value={splitQty}
                onChange={(e) => setSplitQty(Math.min(maxSplittable, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-24 bg-gray-800 border-gray-600"
                disabled={maxSplittable === 0}
              />
              <span className="text-gray-400 text-sm">
                of {maxSplittable} available
              </span>
            </div>
          </div>

          {/* Result Preview */}
          {targetProjectId && splitQty > 0 && (
            <div className="bg-gray-800/30 rounded-lg p-3 space-y-2">
              <p className="text-sm text-gray-400">After split:</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Original ({currentProject?.name}):</p>
                  <p className="text-white font-medium">{(commitment.qty_committed || 0) - splitQty} units</p>
                </div>
                <div>
                  <p className="text-gray-500">New ({projects.find(p => p.id === targetProjectId)?.name}):</p>
                  <p className="text-purple-400 font-medium">{splitQty} units</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={splitMutation.isPending || maxSplittable === 0 || !targetProjectId}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {splitMutation.isPending ? 'Splitting...' : 'Split Commitment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}