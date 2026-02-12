import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Archive, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PartTypeBadge } from "@/components/parts/PartTypeSelector";


export default function AddRequirementModal({ projectId, onClose }) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    part_id: '',
    qty_needed: 1,
    priority: 'Normal',
    notes: '',
    target_install_date: ''
  });

  // Only show active, non-archived parts
  const { data: parts = [] } = useQuery({
    queryKey: ['parts'],
    queryFn: async () => {
      const allParts = await base44.entities.Part.list();
      return allParts.filter(p => !p.is_archived && p.is_active !== false);
    }
  });

  const { data: existingRequirements = [] } = useQuery({
    queryKey: ['partProjectRequirements', projectId],
    queryFn: () => base44.entities.PartProjectRequirement.filter({ project_id: projectId }),
    enabled: !!projectId
  });



  const createMutation = useMutation({
    mutationFn: async (data) => {
      const part = parts.find(p => p.id === data.part_id);
      const qtyNeeded = Number(data.qty_needed) || 1;
      const defaultCost = part?.default_cost || 0;
      
      // Create the requirement
      await base44.entities.PartProjectRequirement.create({
        ...data,
        project_id: projectId,
        qty_needed: qtyNeeded,
        qty_allocated: 0,
        qty_ordered: 0,
        qty_installed: 0,
        status: 'Needed'
      });

      // Create PartBuildAssignment - inherit pricing from Part
      const defaultRetail = part?.default_retail || 0;
      
      await base44.entities.PartBuildAssignment.create({
        part_id: data.part_id,
        project_id: projectId,
        qty_needed: qtyNeeded,
        qty_reserved: 0,
        needed_status: 'Need to Buy',
        notes: data.notes || null,
        default_cost: defaultCost,
        unit_retail: defaultRetail,
        applied_markup_pct: part?.applied_markup_pct || null,
        pricing_source: part?.pricing_mode === 'manual' ? 'override' : 'matrix',
        pricing_locked: false
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partProjectRequirements', projectId] });
      queryClient.invalidateQueries({ queryKey: ['partBuildAssignments'] });
      toast.success('Part requirement added');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to add requirement: ' + error.message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.part_id) {
      toast.error('Please select a part');
      return;
    }
    
    // Check if part already has a requirement
    const existing = existingRequirements.find(r => r.part_id === formData.part_id);
    if (existing) {
      toast.error('This part already has a requirement for this project. Update the existing one instead.');
      return;
    }
    
    createMutation.mutate(formData);
  };

  const filteredParts = parts.filter(p => 
    p.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.vendor_part_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border border-red-900/30 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Part Requirement</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-gray-300">Search Part</Label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search parts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-700"
              />
            </div>
            <Select 
              value={formData.part_id} 
              onValueChange={(v) => setFormData({...formData, part_id: v})}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="Select part..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {filteredParts.slice(0, 50).map(part => (
                  <SelectItem key={part.id} value={part.id}>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{part.part_name}</span>
                      {part.part_type && <PartTypeBadge partType={part.part_type} size="sm" />}
                    </div>
                    {part.vendor_part_number && (
                      <span className="text-xs text-gray-500 block">{part.vendor_part_number}</span>
                    )}
                  </SelectItem>
                ))}
                {filteredParts.length > 50 && (
                  <div className="px-2 py-1 text-xs text-gray-500">
                    Showing 50 of {filteredParts.length} parts. Refine your search.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300">Quantity Needed *</Label>
              <Input
                type="number"
                min="1"
                value={formData.qty_needed}
                onChange={(e) => setFormData({...formData, qty_needed: e.target.value})}
                className="bg-gray-800 border-gray-700"
              />
            </div>
            <div>
              <Label className="text-gray-300">Priority</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(v) => setFormData({...formData, priority: v})}
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

          <div>
            <Label className="text-gray-300">Target Install Date</Label>
            <Input
              type="date"
              value={formData.target_install_date}
              onChange={(e) => setFormData({...formData, target_install_date: e.target.value})}
              className="bg-gray-800 border-gray-700"
            />
          </div>

          <div>
            <Label className="text-gray-300">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Project-specific notes..."
              className="bg-gray-800 border-gray-700 h-20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700">
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-red-600 hover:bg-red-700"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Adding...' : 'Add Requirement'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}