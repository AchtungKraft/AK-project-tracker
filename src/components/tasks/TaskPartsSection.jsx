import React, { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Package, Plus, Wrench, Trash2, CheckCircle, MapPin, AlertTriangle } from "lucide-react";
import { PartTypeBadge } from "@/components/parts/PartTypeSelector";
import ConfirmInventoryActionModal from "@/components/inventory/ConfirmInventoryActionModal";
import { toast } from "sonner";

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
  const [installConfirm, setInstallConfirm] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");

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

  // Fetch parts for display
  const { data: parts = [] } = useQuery({
    queryKey: ["parts"],
    queryFn: () => base44.entities.Part.filter({ is_archived: { $ne: true } }),
  });

  // Fetch inventory items for availability check
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["inventoryItems"],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // Fetch locations for install source selection
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => base44.entities.Location.list(),
  });

  const partsMap = Object.fromEntries(parts.map((p) => [p.id, p]));
  const activeLocations = locations.filter(l => l.active);

  // Get inventory availability for a part
  const getPartInventory = (partId) => {
    const items = inventoryItems.filter(i => i.part_id === partId);
    return items.map(item => {
      const location = locations.find(l => l.id === item.location_id);
      const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
      return {
        ...item,
        location,
        available,
      };
    }).filter(i => i.available > 0);
  };

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

  // Mark as installed mutation using centralized service
  const installMutation = useMutation({
    mutationFn: async ({ link, locationId }) => {
      const part = partsMap[link.part_id];
      const commitment = commitments.find((c) => c.id === link.commitment_id);
      
      // Check if part type affects inventory
      const affectsInventory = part?.affects_inventory !== false;
      
      // Validate inventory availability if needed
      if (affectsInventory && !locationId) {
        // Find any available inventory
        const availableInventory = getPartInventory(link.part_id);
        if (availableInventory.length === 0) {
          throw new Error('No inventory available for this part');
        }
      }
      
      const response = await base44.functions.invoke('mutateInventory', {
        mutation_type: 'install',
        part_id: link.part_id,
        qty: link.qty_allocated,
        project_id: project?.id,
        task_part_link_id: link.id,
        commitment_id: link.commitment_id,
        from_location_id: locationId || null,
        unit_cost: commitment?.unit_cost_snapshot || part?.default_cost || 0,
        notes: `Installed for task: ${task.name}`,
      });
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskPartLinks", task?.id] });
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
      queryClient.invalidateQueries({ queryKey: ["partCommitments"] });
      queryClient.invalidateQueries({ queryKey: ["installedParts"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryAuditLogs"] });
      setInstallConfirm(null);
      setSelectedLocationId("");
      toast.success("Part installed successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to install part");
    },
  });

  const handleInstallClick = (link) => {
    const part = partsMap[link.part_id];
    const commitment = commitments.find((c) => c.id === link.commitment_id);
    const availableInventory = getPartInventory(link.part_id);
    
    // Pre-select first available location
    if (availableInventory.length > 0) {
      setSelectedLocationId(availableInventory[0].location_id);
    } else {
      setSelectedLocationId("");
    }
    
    setInstallConfirm({ link, part, commitment, availableInventory });
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

        {/* Install Confirmation Modal */}
        {installConfirm && (
          <ConfirmInventoryActionModal
            isOpen={!!installConfirm}
            onClose={() => {
              setInstallConfirm(null);
              setSelectedLocationId("");
            }}
            onConfirm={() => installMutation.mutate({ 
              link: installConfirm.link, 
              locationId: selectedLocationId 
            })}
            actionType="install"
            part={installConfirm.part}
            quantity={installConfirm.link.qty_allocated}
            project={project}
            task={task}
            commitment={installConfirm.commitment}
            fromLocation={activeLocations.find(l => l.id === selectedLocationId)}
            isLoading={installMutation.isPending}
          >
            {/* Location Selection for Install */}
            {installConfirm.part?.affects_inventory !== false && (
              <div className="space-y-2 mb-4">
                <Label className="text-gray-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Source Location *
                </Label>
                {installConfirm.availableInventory?.length === 0 ? (
                  <div className="bg-red-900/30 border border-red-600 rounded-lg p-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-red-200 text-sm">No inventory available for this part</span>
                  </div>
                ) : (
                  <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select inventory location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {installConfirm.availableInventory?.map((inv) => (
                        <SelectItem key={inv.id} value={inv.location_id}>
                          {inv.location?.name || inv.location?.location_area || 'Unknown'} 
                          {' '}({inv.available} available)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </ConfirmInventoryActionModal>
        )}
      </CardContent>
    </Card>
  );
}