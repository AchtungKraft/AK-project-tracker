import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Plus, Wrench } from "lucide-react";


/**
 * AddToBuildModal - Add a part requirement to a project/build
 * Creates a PartProjectRequirement with intent only
 * Does NOT allocate inventory or create orders
 */
export default function AddToBuildModal({ part, onClose }) {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    project_id: '',
    qty_needed: 1,
    priority: 'Normal',
    notes: '',
  });
  
  const [allocateImmediately, setAllocateImmediately] = useState(false);
  const [flagNeedToOrder, setFlagNeedToOrder] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });
  
  const { data: projectTypes = [] } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: () => base44.entities.ProjectType.list(),
  });
  
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems', 'forPart', part?.id],
    queryFn: () => base44.entities.InventoryItem.filter({ part_id: part?.id }),
    enabled: !!part?.id && allocateImmediately,
  });



  // Check for existing requirement
  const { data: existingRequirements = [] } = useQuery({
    queryKey: ['partProjectRequirements', 'forPart', part?.id],
    queryFn: async () => {
      const all = await base44.entities.PartProjectRequirement.list();
      return all.filter(r => r.part_id === part?.id);
    },
    enabled: !!part?.id,
  });

  const createRequirementMutation = useMutation({
    mutationFn: async () => {
      if (!formData.project_id) {
        throw new Error('Please select a project');
      }

      const qtyNeeded = Number(formData.qty_needed) || 1;

      // Create commitment via CommitmentService (CANONICAL)
      const response = await base44.functions.invoke('commitmentService', {
        action: 'addPartToProject',
        project_id: formData.project_id,
        part_id: part.id,
        qty_committed: qtyNeeded,
        notes: formData.notes || null,
        source_surface: 'AddToBuildModal',
        requested_by: 'user'
      });

      const commitmentData = response.data;
      if (!commitmentData.success) {
        throw new Error(commitmentData.error || 'Failed to add part to project');
      }

      const commitment = commitmentData.commitment;

      // Handle immediate inventory allocation if requested
      let qtyAllocated = 0;
      if (allocateImmediately && inventoryItems.length > 0) {
        let remainingToAllocate = qtyNeeded;
        
        for (const item of inventoryItems) {
          if (remainingToAllocate <= 0) break;
          
          const available = (item.quantity_on_hand || 0) - (item.quantity_reserved || 0);
          if (available <= 0) continue;
          
          const toAllocate = Math.min(available, remainingToAllocate);
          
          await base44.entities.InventoryItem.update(item.id, {
            quantity_reserved: (item.quantity_reserved || 0) + toAllocate
          });
          
          qtyAllocated += toAllocate;
          remainingToAllocate -= toAllocate;
        }

        // Update commitment with allocated qty
        if (qtyAllocated > 0) {
          await base44.entities.PartCommitment.update(commitment.id, {
            qty_allocated: qtyAllocated
          });
        }
      }
      
      return { commitment, qtyAllocated, needs_cost_review: commitmentData.needs_cost_review };
    },
    onSuccess: ({ commitment, qtyAllocated, needs_cost_review }) => {
      queryClient.invalidateQueries({ queryKey: ['partCommitments'] });
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
      
      let message = 'Part added to build';
      if (qtyAllocated > 0) {
        message += ` (${qtyAllocated} allocated)`;
      }
      if (needs_cost_review) {
        message += ' ⚠️ Cost review needed';
      }
      toast.success(message);
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add to build');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createRequirementMutation.mutate();
  };

  // Filter to active projects only
  const activeProjects = projects.filter(p => p.status_id !== 'completed' && p.status_id !== 'cancelled');

  // Get projects that already have this part
  const projectsWithPart = existingRequirements.map(r => r.project_id);
  
  // Get project type name
  const getTypeName = (typeId) => {
    const type = projectTypes.find(t => t.id === typeId);
    return type?.name || 'Uncategorized';
  };
  
  // Group projects by type
  const projectsByType = activeProjects.reduce((acc, project) => {
    const typeName = getTypeName(project.project_type_id);
    if (!acc[typeName]) acc[typeName] = [];
    acc[typeName].push(project);
    return acc;
  }, {});
  
  // Sort type names alphabetically, but put "Uncategorized" last
  const sortedTypeNames = Object.keys(projectsByType).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });
  
  // Calculate available inventory
  const availableInventory = inventoryItems.reduce((sum, item) => {
    return sum + Math.max(0, (item.quantity_on_hand || 0) - (item.quantity_reserved || 0));
  }, 0);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-orange-400" />
            Add to Build
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Part Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <p className="text-sm font-medium text-white">{part?.part_name}</p>
            {part?.vendor_part_number && (
              <p className="text-xs text-gray-400 font-mono">{part.vendor_part_number}</p>
            )}
          </div>

          {/* Project Selection - Grouped by Type */}
          <div>
            <Label className="text-gray-400 text-xs">Project / Build *</Label>
            <Select
              value={formData.project_id}
              onValueChange={(v) => setFormData({ ...formData, project_id: v })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {activeProjects.length === 0 ? (
                  <div className="p-2 text-sm text-gray-400 text-center">
                    No active projects
                  </div>
                ) : (
                  sortedTypeNames.map(typeName => (
                    <SelectGroup key={typeName}>
                      <SelectLabel className="text-xs text-gray-500 font-semibold px-2 py-1.5 bg-gray-800/50">
                        {typeName}
                      </SelectLabel>
                      {projectsByType[typeName]
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                        .map(project => {
                          const alreadyAdded = projectsWithPart.includes(project.id);
                          return (
                            <SelectItem 
                              key={project.id} 
                              value={project.id}
                              disabled={alreadyAdded}
                            >
                              <span className={alreadyAdded ? 'text-gray-500' : ''}>
                                {project.name}
                                {alreadyAdded && ' (already added)'}
                              </span>
                            </SelectItem>
                          );
                        })
                      }
                    </SelectGroup>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity and Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-xs">Quantity Needed *</Label>
              <Input
                type="number"
                min="1"
                value={formData.qty_needed}
                onChange={(e) => setFormData({ ...formData, qty_needed: e.target.value })}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(v) => setFormData({ ...formData, priority: v })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-gray-400 text-xs">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes for this requirement..."
              className="bg-gray-800 border-gray-700 h-16"
            />
          </div>

          {/* Optional Actions */}
          <div className="space-y-3 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
            <Label className="text-gray-400 text-xs block mb-2">Optional Actions</Label>
            
            <div className="flex items-start gap-2">
              <Checkbox
                id="allocateImmediately"
                checked={allocateImmediately}
                onCheckedChange={setAllocateImmediately}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="allocateImmediately" className="text-gray-300 cursor-pointer text-sm">
                  Allocate from inventory immediately (if available)
                </Label>
                {allocateImmediately && (
                  <p className="text-xs text-gray-500 mt-1">
                    Available: {availableInventory} unit(s)
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <Checkbox
                id="flagNeedToOrder"
                checked={flagNeedToOrder}
                onCheckedChange={setFlagNeedToOrder}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="flagNeedToOrder" className="text-gray-300 cursor-pointer text-sm">
                  Flag as "Need to Order"
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  Part will appear in the Need to Buy list
                </p>
              </div>
            </div>
          </div>

          {/* Info about what this does */}
          <div className="p-2 bg-orange-950/30 border border-orange-900/30 rounded text-xs text-orange-300">
            This adds a part requirement to the build. Ordering is done separately.
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-orange-600 hover:bg-orange-700"
              disabled={createRequirementMutation.isPending || !formData.project_id}
            >
              {createRequirementMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Build
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}