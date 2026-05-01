import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Package, Plus, Wrench, Trash2, CheckCircle } from "lucide-react";
import { PartTypeBadge } from "@/components/parts/PartTypeSelector";
import { toast } from "sonner";
import FinancialStatusBadge from "@/components/financial/FinancialStatusBadge";
import { useFinancialStatusBatch } from "@/components/financial/useFinancialStatus";
import InstallPartModal from "@/components/project/InstallPartModal";

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
  const [allocateQty, setAllocateQty] = useState(1);
  const [installTarget, setInstallTarget] = useState(null);

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

  // Available parts for this project (from commitments, not yet fully linked)
  // Filter out archived parts from new linkages
  const availableParts = commitments
    .filter((c) => {
      const part = partsMap[c.part_id];
      return part && !part.is_archived;
    })
    .map((c) => ({
      ...partsMap[c.part_id],
      commitment: c,
      availableQty: c.qty_committed - c.qty_installed,
    }))
    .filter((p) => p.availableQty > 0);

  // Add part link mutation
  const addLinkMutation = useMutation({
    mutationFn: async () => {
      const commitment = commitments.find((c) => c.part_id === selectedPartId);
      return base44.entities.TaskPartLink.create({
        task_id: task.id,
        project_id: project?.id,
        part_id: selectedPartId,
        commitment_id: commitment?.id,
        qty_allocated: allocateQty,
        qty_installed: 0,
        install_status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskPartLinks", task?.id] });
      setShowAddPart(false);
      setSelectedPartId("");
      setAllocateQty(1);
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

              const isComplete = link.install_status === "complete";

              return (
                <div
                  key={link.id}
                  className={cn(
                    "bg-gray-900/50 rounded-lg p-3 flex items-center justify-between gap-3",
                    isComplete && "opacity-70"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium truncate">{part.part_name}</span>
                      {part.part_type && <PartTypeBadge partType={part.part_type} size="sm" />}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>Qty: {link.qty_allocated}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          isComplete ? "border-green-600 text-green-400" : "border-gray-600"
                        )}
                      >
                        {link.install_status}
                      </Badge>
                    </div>
                    <div className="mt-1">
                      <FinancialStatusBadge 
                        financialStatus={financialStatusMap.get(link.part_id)} 
                        displayMode="compact" 
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isComplete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleInstallClick(link)}
                        className="text-green-400 hover:text-green-300 hover:bg-green-900/30"
                      >
                        <Wrench className="w-4 h-4" />
                      </Button>
                    )}
                    {isComplete && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {!isComplete && (
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
            <Select value={selectedPartId} onValueChange={setSelectedPartId}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select a project part..." />
              </SelectTrigger>
              <SelectContent>
                {availableParts.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    No available parts
                  </SelectItem>
                ) : (
                  availableParts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.part_name} (Available: {p.availableQty})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Input
              type="number"
              min={1}
              max={availableParts.find((p) => p.id === selectedPartId)?.availableQty || 99}
              value={allocateQty}
              onChange={(e) => setAllocateQty(parseInt(e.target.value) || 1)}
              placeholder="Quantity"
              className="bg-gray-800 border-gray-700 text-white"
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddPart(false)}
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