import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Link2, Package, Truck } from "lucide-react";
import { toast } from "sonner";
import { calculateCommitmentState } from "../inventory/commitmentStateEngine";
import { forceAppRefresh } from "@/components/supply/forceAppRefresh";

/**
 * AttachLineItemToBuildModal - Create commitment from existing PO line item
 * 
 * Allows retroactive assignment of ordered parts to builds.
 * Validates: SUM(commitments.qty_committed WHERE line_item_id) <= line_item.qty_ordered
 */
export default function AttachLineItemToBuildModal({ 
  lineItem, 
  part,
  onClose 
}) {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [qtyToAttach, setQtyToAttach] = useState(1);

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  // Fetch existing commitments for this line item
  const { data: allCommitments = [] } = useQuery({
    queryKey: ['partCommitments'],
    queryFn: () => base44.entities.PartCommitment.list(),
  });

  // Calculate already committed qty for this line item
  const alreadyCommitted = useMemo(() => {
    return allCommitments
      .filter(c => 
        (c.order_line_item_ids || []).includes(lineItem.id) &&
        c.commitment_status !== 'cancelled'
      )
      .reduce((sum, c) => sum + (c.qty_committed || 0), 0);
  }, [allCommitments, lineItem.id]);

  const maxAttachable = Math.max(0, (lineItem.qty_ordered || 0) - alreadyCommitted);
  const qtyReceived = lineItem.qty_received || 0;

  // Active projects only
  const activeProjects = projects.filter(p => 
    p.status_id !== 'completed' && p.status_id !== 'cancelled'
  );

  const attachMutation = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      
      // Determine initial status based on receiving
      const proportionalReceived = Math.floor((qtyToAttach / (lineItem.qty_ordered || 1)) * qtyReceived);
      const initialStatus = calculateCommitmentState({
        qty_committed: qtyToAttach,
        qty_ordered: qtyToAttach,
        qty_received: proportionalReceived,
        qty_allocated: 0,
        qty_installed: 0
      });

      // Create new commitment
      const commitment = await base44.entities.PartCommitment.create({
        project_id: selectedProjectId,
        part_id: part.id,
        qty_committed: qtyToAttach,
        qty_ordered: qtyToAttach,
        qty_received: proportionalReceived,
        qty_allocated: 0,
        qty_installed: 0,
        commitment_status: initialStatus,
        source_type: 'order_attachment',
        order_line_item_ids: [lineItem.id],
        unit_cost_snapshot: lineItem.unit_cost || part.default_cost,
        commitment_version: 1
      });

      // Audit log
      await base44.entities.CommitmentAuditLog.create({
        commitment_id: commitment.id,
        action_type: 'create',
        previous_values: null,
        new_values: {
          project_id: selectedProjectId,
          part_id: part.id,
          qty_committed: qtyToAttach,
          source_type: 'order_attachment',
          line_item_id: lineItem.id
        },
        trigger_source: 'manual',
        triggered_by: user.email,
        validation_passed: true
      });

      return commitment;
    },
    onSuccess: async (commitment) => {
      // PHASE 17: Deterministic refresh
      await forceAppRefresh(queryClient, {
        partIds: [part.id],
        projectIds: [selectedProjectId],
        commitmentIds: commitment?.id ? [commitment.id] : [],
        orderIds: lineItem?.order_id ? [lineItem.order_id] : [],
      });
      toast.success('Line item attached to build');
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to attach: ${error.message}`);
    }
  });

  const handleSubmit = () => {
    if (!selectedProjectId) {
      toast.error('Please select a project');
      return;
    }
    if (qtyToAttach <= 0 || qtyToAttach > maxAttachable) {
      toast.error(`Quantity must be between 1 and ${maxAttachable}`);
      return;
    }
    attachMutation.mutate();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Link2 className="w-5 h-5 text-blue-400" />
            Attach to Build
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Part Info */}
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-white font-medium">{part?.part_name}</span>
            </div>
            {part?.vendor_part_number && (
              <div className="text-xs text-gray-500 font-mono">{part.vendor_part_number}</div>
            )}
          </div>

          {/* Line Item Status */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Ordered</p>
              <p className="text-lg font-bold text-purple-400">{lineItem.qty_ordered || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Received</p>
              <p className="text-lg font-bold text-cyan-400">{lineItem.qty_received || 0}</p>
            </div>
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-xs text-gray-400">Unassigned</p>
              <p className="text-lg font-bold text-yellow-400">{maxAttachable}</p>
            </div>
          </div>

          {/* Already Committed Warning */}
          {alreadyCommitted > 0 && (
            <div className="flex items-start gap-2 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
              <Truck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-blue-400">{alreadyCommitted} already assigned to builds</p>
              </div>
            </div>
          )}

          {/* No remaining qty */}
          {maxAttachable === 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-400">
                All ordered quantity is already assigned to builds.
              </div>
            </div>
          )}

          {/* Project Selection */}
          <div className="space-y-2">
            <Label className="text-gray-300">Assign to Project</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                    {project.client_name && ` - ${project.client_name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label className="text-gray-300">Quantity to Assign</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={maxAttachable}
                value={qtyToAttach}
                onChange={(e) => setQtyToAttach(Math.min(maxAttachable, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-24 bg-gray-800 border-gray-600"
                disabled={maxAttachable === 0}
              />
              <span className="text-gray-400 text-sm">
                of {maxAttachable} available
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-gray-600">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={attachMutation.isPending || maxAttachable === 0 || !selectedProjectId}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {attachMutation.isPending ? 'Attaching...' : 'Attach to Build'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}