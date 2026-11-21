import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { getContainerTypeOptions } from "./containerTypeConfig";
import ToteLabelPrintButton from "./labels/ToteLabelPrintButton";

export default function CreateContainerModal({ onClose, preselectedLocationId, preselectedProjectId, locations = [], projects = [] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [containerType, setContainerType] = useState('tote');
  const [locationId, setLocationId] = useState(preselectedLocationId || '');
  const [homeLocationId, setHomeLocationId] = useState('');
  const [projectId, setProjectId] = useState(preselectedProjectId || '');
  const [requestKey] = useState(() => `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const [color, setColor] = useState('#6366F1');
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [createdContainer, setCreatedContainer] = useState(null);

  const typeOptions = getContainerTypeOptions();
  const sortedLocations = locations.filter(l => l.active !== false).sort((a, b) => (a.location_area || '').localeCompare(b.location_area || ''));

  // V2.4: the permanent number (YY_TYPE_NNNNNN) is issued by the server's global counter.
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('storageLabels', {
        action: 'create_container', request_key: requestKey, name, container_type: containerType, color,
        location_id: locationId || undefined,
        home_location_id: homeLocationId && homeLocationId !== '__none__' ? homeLocationId : undefined,
        project_id: projectId && projectId !== '__none__' ? projectId : undefined,
        notes, description,
      });
      return res.data.container;
    },
    onSuccess: (container) => {
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      setCreatedContainer(container);
      toast.success(`Container "${container.name}" created · ${container.short_code}`);
    },
    onError: (e) => toast.error('Failed to create container: ' + (e?.response?.data?.error || e.message)),
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
              <ToteLabelPrintButton container={createdContainer} locations={locations} size="default" variant="default" className="gap-2">
                <Printer className="w-4 h-4" /> Print QR Label
              </ToteLabelPrintButton>
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
              <Select value={containerType} onValueChange={setContainerType}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400">Container #</Label>
              <div className="mt-1 h-9 flex items-center px-3 rounded-md border border-gray-700 bg-gray-800/50 text-xs text-gray-400">
                Assigned on create
              </div>
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
            <Label className="text-gray-400">Notes <span className="text-gray-600">(optional)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Customer Supplied, Fragile, Do Not Stack…" className="bg-gray-800 border-gray-700 text-white mt-1" />
          </div>
          <div>
            <Label className="text-gray-400">Description <span className="text-gray-600">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Longer description…" className="bg-gray-800 border-gray-700 text-white mt-1" rows={2} />
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