import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Package, Plus, Wrench, Trash2, CheckCircle, Eye } from "lucide-react";
import { createPortal } from "react-dom";
import PartModal from "@/components/parts/PartModal";
import { PartTypeBadge } from "@/components/parts/PartTypeSelector";
import { toast } from "sonner";
import FinancialStatusBadge from "@/components/financial/FinancialStatusBadge";
import { useFinancialStatusBatch } from "@/components/financial/useFinancialStatus";
import InstallPartModal from "@/components/project/InstallPartModal";
import { resolveLifecycleState, getLifecycleLabel } from "@/components/supply/resolveCommitmentStateLocal";
import TaskPartSelector from "@/components/tasks/TaskPartSelector";

const INSTALL_STATUS_BADGE_STYLES = {
  complete: "border-gray-600 text-gray-400",
  partial:  "border-blue-600 text-blue-400",
  pending:  "border-amber-600 text-amber-400",
};

function InstallStatusBadge({ installStatus, qtyInstalled, qtyAllocated }) {
  const status = installStatus || 'pending';
  const style = INSTALL_STATUS_BADGE_STYLES[status] || "border-gray-600 text-gray-400";
  const label = status === 'complete' ? 'Installed'
    : status === 'partial' ? `Partial (${qtyInstalled ?? 0}/${qtyAllocated ?? 1})`
    : 'Pending';
  return (
    <Badge variant="outline" className={cn("text-xs px-2 py-0.5 inline", style)}>
      {label}
    </Badge>
  );
}

const LIFECYCLE_BADGE_STYLES = {
  INSTALL_READY: "border-emerald-600 text-emerald-400",
  INSTALLED:     "border-gray-600 text-gray-400",
  COVERED:       "border-blue-600 text-blue-400",
  NEEDS_ORDER:   "border-amber-600 text-amber-400",
  PLANNED:       "border-gray-600 text-gray-300",
  CANCELLED:     "border-gray-700 text-gray-500",
  CLOSED:        "border-gray-700 text-gray-500",
};

function LifecycleStateBadge({ state, label }) {
  const style = LIFECYCLE_BADGE_STYLES[state] || "border-gray-600 text-gray-400";
  return (
    <Badge variant="outline" className={cn("text-xs", style)}>
      {label}
    </Badge>
  );
}

/**
 * TaskPartsSection
 * Displays and manages parts associated with a task
 * Allows linking project parts and tracking installation status
 */
export default function TaskPartsSection({
  task,
  project,
  onUpdate,
}) {
  const queryClient = useQueryClient();
  const [showAddPart, setShowAddPart] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedCommitmentId, setSelectedCommitmentId] = useState("");
  const [allocateQty, setAllocateQty] = useState(1);
  const [maxQty, setMaxQty] = useState(99);
  const [installTarget, setInstallTarget] = useState(null);
  const [viewPartId, setViewPartId] = useState(null);

  // Fetch task-part links
  const { data: taskPartLinks = [], isLoading: linksLoading } = useQuery({
    queryKey: ["taskPartLinks", task?.id],
    queryFn: () => base44.entities.TaskPartLink.filter({ task_id: task.id }),
    enabled: !!task?.id,
  });

  // Fetch project commitments (available parts)
  const { data: commitments = [] } = useQuery({
    queryKey: ["commitments", project?.id],
    queryFn: () => base44.entities.PartCommitment.filter({ project_id: project.id }),
    enabled: !!project?.id,
  });

  // Fetch parts for display — only when we have task links to resolve
  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.filter({ is_archived: { $ne: true } }),
    enabled: !!task?.id,
    staleTime: 30000,
  });

  const partsMap = Object.fromEntries(parts.map((p) => [p.id, p]));
  const commitmentsMap = Object.fromEntries(commitments.map((c) => [c.id, c]));

  // Batch resolve financial status for linked parts
  const financialContexts = useMemo(() => {
    return taskPartLinks.map(link => ({
      part_id: link.part_id,
      project_id: project?.id,
      commitment_id: link.commitment_id,
    }));
  }, [taskPartLinks, project?.id]);
  
  const { data: financialStatuses = [] } = useFinancialStatusBatch(financialContexts, {
    enabled: taskPartLinks.length > 0,
  });
  
  const financialStatusMap = useMemo(() => {
    const map = new Map();
    financialStatuses.forEach(fs => {
      map.set(fs.part_id, fs);
    });
    return map;
  }, [financialStatuses]);

  // Add part link mutation
  const addLinkMutation = useMutation({
    mutationFn: async () => {
      return base44.entities.TaskPartLink.create({
        task_id: task.id,
        project_id: project?.id,
        part_id: selectedPartId,
        commitment_id: selectedCommitmentId,
        qty_allocated: allocateQty,
        qty_installed: 0,
        install_status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskPartLinks", task?.id] });
      setShowAddPart(false);
      setSelectedPartId("");
      setSelectedCommitmentId("");
      setAllocateQty(1);
      setMaxQty(99);
    },
  });

  // Remove part link mutation
  const removeLinkMutation = useMutation({
    mutationFn: (linkId) => base44.entities.TaskPartLink.delete(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskPartLinks", task?.id] });
    },
  });

  const handleInstallClick = (link) => {
    const commitment = commitments.find((c) => c.id === link.commitment_id);
    if (!commitment) {
      toast.error("No commitment found for this part link");
      return;
    }
    setInstallTarget(commitment);
  };

  if (!task) return null;

  // Empty state: inline single-line display, no card wrapper
  if (!linksLoading && taskPartLinks.length === 0 && !showAddPart) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-sm text-gray-500">No parts linked</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAddPart(true)}
          className="text-gray-400 hover:text-white gap-1 h-8 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Link Part
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Linked Parts List */}
      {linksLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="divide-y divide-gray-800/60">
          {taskPartLinks.map((link) => {
            const part = partsMap[link.part_id];
            if (!part) return null;

            const commitment = commitmentsMap[link.commitment_id];
            const isInstalled = link.install_status === 'complete';
            const lifecycleState = resolveLifecycleState(commitment);
            const isTerminal = lifecycleState === 'CANCELLED' || lifecycleState === 'CLOSED';

            return (
              <div
                key={link.id}
                className={cn(
                  "flex items-center gap-3 py-2 group",
                  (isInstalled || isTerminal) && "opacity-60"
                )}
              >
                {/* Thumbnail */}
                {part.featured_photo ? (
                  <img src={part.featured_photo} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 bg-gray-800" />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <Package className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                )}

                {/* Name + meta */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className="text-sm font-medium leading-tight text-gray-200 truncate block">{part.part_name}</span>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-white/60">
                    <span>Qty: {link.qty_allocated}</span>
                    <InstallStatusBadge
                      installStatus={link.install_status}
                      qtyInstalled={link.qty_installed}
                      qtyAllocated={link.qty_allocated}
                    />
                  </div>
                </div>

                {/* Status / actions — compact, revealed on hover */}
                <div className="flex items-center gap-1 shrink-0">
                  {isInstalled && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {!isInstalled && !isTerminal && lifecycleState === 'INSTALL_READY' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleInstallClick(link)}
                      className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-900/30 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setViewPartId(part.id)}
                    className="h-7 w-7 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  {!isInstalled && !isTerminal && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeLinkMutation.mutate(link.id)}
                      className="h-7 w-7 text-red-400/60 hover:text-red-300 hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Part Form */}
      {showAddPart ? (
        <div className="mt-2 bg-gray-900/50 rounded-lg p-3 space-y-3">
          <TaskPartSelector
            commitments={commitments}
            partsMap={partsMap}
            selectedPartId={selectedPartId}
            onSelect={(partId, commitmentId, availableQty) => {
              setSelectedPartId(partId);
              setSelectedCommitmentId(commitmentId);
              setMaxQty(availableQty || 99);
              setAllocateQty(1);
            }}
          />

          {selectedPartId && (
            <Input
              type="number"
              min={1}
              max={maxQty}
              value={allocateQty}
              onChange={(e) => setAllocateQty(Math.min(parseInt(e.target.value) || 1, maxQty))}
              placeholder="Quantity"
              className="bg-gray-800 border-gray-700 text-white"
            />
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAddPart(false);
                setSelectedPartId("");
                setSelectedCommitmentId("");
              }}
              className="flex-1 border-gray-700"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addLinkMutation.mutate()}
              disabled={!selectedPartId || addLinkMutation.isPending}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddPart(true)}
          className="mt-2 inline-flex items-center gap-1 border border-dashed border-white/10 text-white/50 hover:text-white/70 hover:border-white/20 text-xs py-2 px-3 rounded-md max-w-xs transition-colors"
        >
          <Plus className="w-3 h-3" />
          Link Part
        </button>
      )}

      {/* View Part Modal — portaled to escape parent modal z-index */}
      {viewPartId && createPortal(
        <PartModal
          part={partsMap[viewPartId]}
          partId={viewPartId}
          onClose={() => setViewPartId(null)}
        />,
        document.body
      )}

      {/* Canonical Install Part Modal */}
      {installTarget && (
        <InstallPartModal
          commitment={installTarget}
          onClose={() => {
            setInstallTarget(null);
            queryClient.invalidateQueries({ queryKey: ["taskPartLinks", task?.id] });
            queryClient.invalidateQueries({ queryKey: ["commitments", project?.id] });
          }}
        />
      )}
    </div>
  );
}