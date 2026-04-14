import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function LocationSelect({ value, onValueChange, className }) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationParentId, setNewLocationParentId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.Location.list()
  });

  const parentLocations = locations.filter(l => !l.parent_id && l.active !== false);

  const handleCreateLocation = async () => {
    if (!newLocationName.trim()) {
      toast.error('Location name is required');
      return;
    }

    // Check for duplicates under same parent
    const existingLocation = locations.find(l => 
      l.location_area?.toLowerCase() === newLocationName.trim().toLowerCase() &&
      (l.parent_id || '') === (newLocationParentId || '')
    );

    if (existingLocation) {
      toast.error('A location with this name already exists' + (newLocationParentId ? ' under this parent' : ''));
      return;
    }

    setIsCreating(true);
    try {
      const newLocation = await base44.entities.Location.create({
        location_area: newLocationName.trim(),
        parent_id: newLocationParentId || null,
        active: true,
        color: '#3B82F6'
      });

      await queryClient.invalidateQueries({ queryKey: ['locations'] });
      
      // Auto-select the new location
      onValueChange(newLocation.id);
      
      toast.success('Location created');
      setShowCreateModal(false);
      setNewLocationName('');
      setNewLocationParentId('');
    } catch (error) {
      toast.error('Failed to create location: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectChange = (val) => {
    if (val === '__create_new__') {
      setShowCreateModal(true);
    } else {
      onValueChange(val === 'none' ? '' : val);
    }
  };

  return (
    <>
      <Select value={value || 'none'} onValueChange={handleSelectChange}>
        <SelectTrigger className={className || "bg-gray-800 border-gray-700"}>
          <SelectValue placeholder="Select location..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-gray-400">No location</span>
          </SelectItem>
          
          {parentLocations
            .sort((a, b) => (a.location_area || '').localeCompare(b.location_area || ''))
            .map(parent => {
            const children = locations
              .filter(l => l.parent_id === parent.id && l.active !== false)
              .sort((a, b) => (a.bin_description || a.location_area || '').localeCompare(b.bin_description || b.location_area || ''));
            return (
              <React.Fragment key={parent.id}>
                <SelectItem value={parent.id}>
                  <span style={{ color: parent.color || '#8B5CF6' }}>{parent.bin_description || parent.location_area}</span>
                </SelectItem>
                {children.map(child => (
                  <SelectItem key={child.id} value={child.id}>
                    <span className="pl-4" style={{ color: child.color || '#8B5CF6' }}>
                      ↳ {child.bin_description || child.location_area}
                    </span>
                  </SelectItem>
                ))}
              </React.Fragment>
            );
          })}
          
          {/* Orphan locations (parent missing) */}
          {locations
            .filter(l => l.parent_id && !parentLocations.find(p => p.id === l.parent_id) && l.active !== false)
            .sort((a, b) => (a.bin_description || a.location_area || '').localeCompare(b.bin_description || b.location_area || ''))
            .map(loc => (
              <SelectItem key={loc.id} value={loc.id}>
                <span style={{ color: loc.color || '#8B5CF6' }}>{loc.bin_description || loc.location_area}</span>
              </SelectItem>
            ))}

          <div className="border-t border-gray-700 mt-1 pt-1">
            <SelectItem value="__create_new__">
              <span className="flex items-center gap-2 text-blue-400">
                <Plus className="w-4 h-4" />
                Add New Location
              </span>
            </SelectItem>
          </div>
        </SelectContent>
      </Select>

      {/* Create Location Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              Add New Location
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-gray-300">Location Name *</Label>
              <Input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="e.g., Shelf A, Bay 1, Main Storage"
                className="bg-gray-800 border-gray-700 text-white mt-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLocationName.trim()) {
                    handleCreateLocation();
                  }
                }}
              />
            </div>

            <div>
              <Label className="text-gray-300">Parent Location (optional)</Label>
              <Select 
                value={newLocationParentId || 'none'} 
                onValueChange={(v) => setNewLocationParentId(v === 'none' ? '' : v)}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                  <SelectValue placeholder="Select parent (for sub-location)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-gray-400">None (top-level location)</span>
                  </SelectItem>
                  {parentLocations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>
                      <span style={{ color: loc.color }}>{loc.location_area}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to create a main location, or select a parent to create a sub-location
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateModal(false);
                  setNewLocationName('');
                  setNewLocationParentId('');
                }}
                className="border-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateLocation}
                disabled={isCreating || !newLocationName.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isCreating ? 'Creating...' : 'Create Location'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}