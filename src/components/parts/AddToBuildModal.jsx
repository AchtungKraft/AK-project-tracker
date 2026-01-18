import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
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

      // Check if requirement already exists for this part/project combination
      const existing = existingRequirements.find(r => r.project_id === formData.project_id);
      if (existing) {
        throw new Error('This part is already added to this build. Update the existing requirement instead.');
      }

      // Create the requirement with intent only - no allocation or ordering
      await base44.entities.PartProjectRequirement.create({
        part_id: part.id,
        project_id: formData.project_id,
        qty_needed: Number(formData.qty_needed) || 1,
        qty_allocated: 0,
        qty_ordered: 0,
        qty_installed: 0,
        status: 'Needed',
        priority: formData.priority,
        notes: formData.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements'] });
      toast.success('Part added to build');
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

          {/* Project Selection */}
          <div>
            <Label className="text-gray-400 text-xs">Project / Build *</Label>
            <Select
              value={formData.project_id}
              onValueChange={(v) => setFormData({ ...formData, project_id: v })}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.length === 0 ? (
                  <div className="p-2 text-sm text-gray-400 text-center">
                    No active projects
                  </div>
                ) : (
                  activeProjects.map(project => {
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

          {/* Info about what this does */}
          <div className="p-2 bg-orange-950/30 border border-orange-900/30 rounded text-xs text-orange-300">
            This adds a part requirement to the build. Inventory allocation and ordering are done separately.
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