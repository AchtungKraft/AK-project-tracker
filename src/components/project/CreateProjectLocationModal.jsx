import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const PROJECT_LOCATION_TYPES = [
  { value: 'project_storage', label: 'Project Storage' },
  { value: 'project_shelf', label: 'Project Shelf' },
  { value: 'project_cart', label: 'Project Cart' },
  { value: 'rack', label: 'Rack' },
  { value: 'shelf', label: 'Shelf' },
  { value: 'area', label: 'Area' },
  { value: 'staging', label: 'Staging' },
];

export default function CreateProjectLocationModal({ onClose, projectId, projectName, locations = [] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [locationType, setLocationType] = useState('project_storage');
  const [parentId, setParentId] = useState('');
  const [shortCode, setShortCode] = useState('');

  const parentLocations = useMemo(() =>
    locations
      .filter(l => l.active !== false)
      .sort((a, b) => (a.location_area || '').localeCompare(b.location_area || '')),
    [locations]
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const loc = await base44.entities.Location.create({
        location_area: name.trim(),
        location_type: locationType,
        project_id: projectId,
        is_project_storage: true,
        parent_id: parentId || undefined,
        short_code: shortCode.trim() || undefined,
        active: true,
        sort_order: 0,
      });
      // Set QR code value
      await base44.entities.Location.update(loc.id, {
        qr_code_value: `AK_LOC:${loc.id}`,
      });
      return loc;
    },
    onSuccess: (loc) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast({ title: 'Location created', description: `${name} added to ${projectName || 'project'} storage` });
      onClose(loc);
    },
    onError: (e) => toast({ title: 'Failed to create location', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>New Project Location</DialogTitle>
          <p className="text-xs text-gray-400 mt-1">
            Create a storage location for <span className="text-blue-400">{projectName}</span>
          </p>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-400">Location Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Engine Parts Shelf" className="bg-gray-800 border-gray-700 text-white mt-1" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400">Type</Label>
              <Select value={locationType} onValueChange={setLocationType}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_LOCATION_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Short Code</Label>
              <Input value={shortCode} onChange={(e) => setShortCode(e.target.value)}
                placeholder="Auto" className="bg-gray-800 border-gray-700 text-white mt-1 font-mono" />
            </div>
          </div>
          <div>
            <Label className="text-gray-400">Physical Parent Location *</Label>
            <p className="text-[10px] text-gray-500 mb-1">Where does this physically sit in the shop?</p>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select physical location…" />
              </SelectTrigger>
              <SelectContent>
                {parentLocations.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onClose()}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || !parentId || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Create Location
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}