import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ArrowRight, AlertTriangle } from "lucide-react";

/**
 * MoveRequirementModal - Move a part requirement to a different project
 * Handles allocation transfer: releases from old project, re-attempts on new
 */
export default function MoveRequirementModal({ requirement, part, currentProject, onClose }) {
  const queryClient = useQueryClient();
  const [targetProjectId, setTargetProjectId] = useState('');

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const hasInstalled = (requirement.qty_installed || 0) > 0;
  const hasAllocated = (requirement.qty_allocated || 0) > (requirement.qty_installed || 0);
  const allocatedNotInstalled = (requirement.qty_allocated || 0) - (requirement.qty_installed || 0);

  // Group projects by type
  const groupedProjects = useMemo(() => {
    const groups = {};
    const availableProjects = projects.filter(p => p.id !== currentProject?.id);
    
    availableProjects.forEach(project => {
      const typeId = project.project_type_id || 'none';
      const typeName = projectTypes.find(t => t.id === typeId)?.name || 'Other';
      if (!groups[typeName]) groups[typeName] = [];
      groups[typeName].push(project);
    });
    
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [projects, projectTypes, currentProject]);

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!targetProjectId) throw new Error('Please select a target project');
      
      // If there's allocated inventory, release it first
      if (allocatedNotInstalled > 0) {
        const partInventory = inventoryItems.filter(i => i.part_id === requirement.part_id);
        let remainingToRelease = allocatedNotInstalled;
        
        for (const item of partInventory) {
          if (remainingToRelease <= 0) break;
          const reservedHere = Math.min(item.quantity_reserved || 0, remainingToRelease);
          if (reservedHere > 0) {
            await base44.entities.InventoryItem.update(item.id, {
              quantity_reserved: Math.max(0, (item.quantity_reserved || 0) - reservedHere)
            });
            remainingToRelease -= reservedHere;
          }
        }
      }
      
      // Update the requirement to point to new project
      // Reset allocation since we released it, keep qty_ordered
      await base44.entities.PartProjectRequirement.update(requirement.id, {
        project_id: targetProjectId,
        qty_allocated: requirement.qty_installed || 0, // Only keep what's installed
        status: (requirement.qty_installed || 0) >= (requirement.qty_needed || 0) 
          ? 'Installed' 
          : (requirement.qty_ordered || 0) > 0 
            ? 'Ordered' 
            : 'Needed',
      });
      
      // Attempt to re-allocate from available inventory for new project
      if (allocatedNotInstalled > 0) {
        const freshInventory = await base44.entities.InventoryItem.list();
        const partInventory = freshInventory.filter(i => i.part_id === requirement.part_id);
        let toAllocate = allocatedNotInstalled;
        let actuallyAllocated = 0;
        
        for (const item of partInventory) {
          if (toAllocate <= 0) break;
          const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
          const canAllocate = Math.min(available, toAllocate);
          
          if (canAllocate > 0) {
            await base44.entities.InventoryItem.update(item.id, {
              quantity_reserved: (item.quantity_reserved || 0) + canAllocate
            });
            actuallyAllocated += canAllocate;
            toAllocate -= canAllocate;
          }
        }
        
        // Update requirement with new allocation
        if (actuallyAllocated > 0) {
          const updatedReq = await base44.entities.PartProjectRequirement.filter({ id: requirement.id });
          const currentReq = updatedReq[0];
          const newAllocated = (currentReq?.qty_allocated || 0) + actuallyAllocated;
          await base44.entities.PartProjectRequirement.update(requirement.id, {
            qty_allocated: newAllocated,
            status: newAllocated >= (requirement.qty_needed || 0) ? 'Allocated' : 'Partially Allocated',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      toast.success('Requirement moved to new project');
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to move requirement');
    },
  });

  if (hasInstalled) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Cannot Move
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300">
              This part has <strong>{requirement.qty_installed}</strong> unit(s) already installed.
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Parts that have been installed cannot be moved to another project.
            </p>
          </div>
          <Button variant="outline" onClick={onClose} className="border-gray-700">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-blue-400" />
            Move to Different Project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Part Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm font-medium text-white">{part?.part_name}</p>
            <p className="text-xs text-gray-400">
              Qty needed: {requirement.qty_needed} · 
              Allocated: {requirement.qty_allocated || 0} · 
              On order: {requirement.qty_ordered || 0}
            </p>
          </div>

          {/* Current Project */}
          <div>
            <Label className="text-gray-400 text-xs">Current Project</Label>
            <p className="text-white">{currentProject?.name || 'Unknown'}</p>
          </div>

          {/* Warning about allocation */}
          {hasAllocated && (
            <div className="p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-sm">
              <p className="text-yellow-400 font-medium">Allocation will be transferred</p>
              <p className="text-gray-400 text-xs mt-1">
                {allocatedNotInstalled} allocated unit(s) will be released and re-allocated to the new project if inventory is available.
              </p>
            </div>
          )}

          {/* Target Project */}
          <div>
            <Label className="text-gray-400 text-xs">Move to Project *</Label>
            <Select value={targetProjectId} onValueChange={setTargetProjectId}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select target project..." />
              </SelectTrigger>
              <SelectContent>
                {groupedProjects.map(([typeName, typeProjects]) => (
                  <SelectGroup key={typeName}>
                    <SelectLabel className="text-gray-500">{typeName}</SelectLabel>
                    {typeProjects.sort((a, b) => a.name.localeCompare(b.name)).map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button
              onClick={() => moveMutation.mutate()}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!targetProjectId || moveMutation.isPending}
            >
              {moveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Moving...</>
              ) : (
                'Move Requirement'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}