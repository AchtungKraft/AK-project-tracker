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

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-sm flex items-center gap-2">
          <Package className="w-4 h-4" />
          Associated Parts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Linked Parts List */}
        {linksLoading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : taskPartLinks.length === 0 ? (
          <p className="text-gray-500 text-sm">No parts linked to this task.</p>
        ) : (
          <div className="space-y-2">
            {taskPartLinks.map((link) => {
              const part = partsMap[link.part_id];
              if (!part) return null;

              const commitment = commitmentsMap[link.commitment_id];
              const lifecycleState = resolveLifecycleState(commitment);
              const lifecycleLabel = getLifecycleLabel(commitment);
              const isInstalled = lifecycleState === 'INSTALLED';
              const isTerminal = lifecycleState === 'CANCELLED' || lifecycleState === 'CLOSED';

              return (
                <div
                  key={link.id}
                  className={cn(
                    "bg-gray-900/50 rounded-lg p-3 flex items-center justify-between gap-3",
                    (isInstalled || isTerminal) && "opacity-70"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium truncate">{part.part_name}</span>
                      {part.part_type && <PartTypeBadge partType={part.part_type} size="sm" />}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>Qty: {link.qty_allocated}</span>
                      <LifecycleStateBadge state={lifecycleState} label={lifecycleLabel} />
                    </div>
                    <div className="mt-1">
                      <FinancialStatusBadge 
                        financialStatus={financialStatusMap.get(link.part_id)} 
                        displayMode="compact" 
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setViewPartId(part.id)}
                      className="text-gray-400 hover:text-white hover:bg-gray-700/50"
                      title="View part details"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {lifecycleState === 'INSTALL_READY' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleInstallClick(link)}
                        className="text-green-400 hover:text-green-300 hover:bg-green-900/30"
                      >
                        <Wrench className="w-4 h-4" />
                      </Button>
                    )}
                    {isInstalled && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {!isInstalled && !isTerminal && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLinkMutation.mutate(link.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
                      >
                        <Trash2 className="w-4 h-4" />
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
          <div className="bg-gray-900/50 rounded-lg p-3 space-y-3">
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddPart(true)}
            className="w-full border-gray-700 text-gray-300"
          >
            <Plus className="w-4 h-4 mr-2" />
            Link Part
          </Button>
        )}

        {/* View Part Modal — portaled to escape parent modal z-index */}
        {viewPartId && createPortal(
          <PartModal
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
      </CardContent>
    </Card>
  );
}