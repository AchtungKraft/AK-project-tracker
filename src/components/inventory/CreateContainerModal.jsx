import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { getContainerTypeOptions, generateContainerNumber } from "./containerTypeConfig";
import { printContainerQRLabel } from "./containerQRLabel";

export default function CreateContainerModal({ onClose, preselectedLocationId, preselectedProjectId, locations = [], projects = [] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [containerType, setContainerType] = useState('tote');
  const [locationId, setLocationId] = useState(preselectedLocationId || '');
  const [homeLocationId, setHomeLocationId] = useState('');
  const [projectId, setProjectId] = useState(preselectedProjectId || '');
  const [containerNumber, setContainerNumber] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [description, setDescription] = useState('');
  const [createdContainer, setCreatedContainer] = useState(null);

  const typeOptions = getContainerTypeOptions();
  const sortedLocations = locations.filter(l => l.active !== false).sort((a, b) => (a.location_area || '').localeCompare(b.location_area || ''));

  // Fetch existing containers for auto-numbering
  const { data: existingContainers = [] } = useQuery({
    queryKey: ['storageContainers'],
    queryFn: () => base44.entities.StorageContainer.filter({ active: true }),
    staleTime: 30000,
  });

  // Auto-generate container number when type changes
  const suggestedNumber = useMemo(() =>
    generateContainerNumber(containerType, existingContainers),
    [containerType, existingContainers]
  );

  // Use suggested if user hasn't manually edited
  const effectiveNumber = containerNumber || suggestedNumber;

  const createMutation = useMutation({
    mutationFn: async () => {
      const qrValue = `AK_CONTAINER:${Date.now()}`;
      const data = {
        name,
        container_type: containerType,
        color,
        short_code: effectiveNumber,
        qr_code_value: qrValue,
        status: 'active',
        ...(locationId && { location_id: locationId }),
        ...(homeLocationId && homeLocationId !== '__none__' && { home_location_id: homeLocationId }),
        ...(projectId && projectId !== '__none__' && { project_id: projectId }),
        ...(description && { description }),
      };
      return base44.entities.StorageContainer.create(data);
    },
    onSuccess: (container) => {
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      setCreatedContainer(container);
      toast.success(`Container "${name}" created · ${effectiveNumber}`);
    },
    onError: (e) => toast.error('Failed to create container: ' + e.message),
  });

  if (createdContainer) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
          <DialogHeader><DialogTitle>Container Created</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center py-4">
            {createdContainer.photo ? (
              <img src={createdContainer.photo} alt={createdContainer.name} className="w-16 h-16 rounded-lg object-cover mx-auto border border-gray-700" />
            ) : (
              <div className="text-4xl">📦</div>
            )}
            <div>
              <p className="text-lg font-bold text-white">{createdContainer.name}</p>
              {createdContainer.short_code && (
                <p className="text-xl font-mono font-bold text-gray-300 mt-1">{createdContainer.short_code}</p>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => printContainerQRLabel(createdContainer, { locations })} className="gap-2">
                <Printer className="w-4 h-4" /> Print QR Label
              </Button>
              <Button variant="outline" onClick={onClose}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader><DialogTitle>New Container</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-400">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engine Hardware" className="bg-gray-800 border-gray-700 text-white mt-1" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400">Type</Label>
              <Select value={containerType} onValueChange={(v) => { setContainerType(v); setContainerNumber(''); }}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Container #</Label>
              <Input
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
                placeholder={suggestedNumber}
                className="bg-gray-800 border-gray-700 text-white mt-1 font-mono"
              />
            </div>
          </div>
          <div>
            <Label className="text-gray-400">Current Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Select location…" /></SelectTrigger>
              <SelectContent>
                {sortedLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-400">Home Location <span className="text-gray-600">(optional)</span></Label>
            <Select value={homeLocationId} onValueChange={setHomeLocationId}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Same as current" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {sortedLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {projects.length > 0 && (
            <div>
              <Label className="text-gray-400">Project <span className="text-gray-600">(optional)</span></Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-gray-400">Description <span className="text-gray-600">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes…" className="bg-gray-800 border-gray-700 text-white mt-1" rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Create Container
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}