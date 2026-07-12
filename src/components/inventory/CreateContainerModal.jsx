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
import { renderQRSVGString } from "./QRCodeSVG";

export default function CreateContainerModal({ onClose, preselectedLocationId, preselectedProjectId, locations = [], projects = [] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [containerType, setContainerType] = useState('tote');
  const [locationId, setLocationId] = useState(preselectedLocationId || '');
  const [projectId, setProjectId] = useState(preselectedProjectId || '');
  const [shortCode, setShortCode] = useState('');
  const [color, setColor] = useState('#6366F1');
  const [description, setDescription] = useState('');
  const [createdContainer, setCreatedContainer] = useState(null);

  const typeOptions = getContainerTypeOptions();

  const createMutation = useMutation({
    mutationFn: async () => {
      const qrValue = `AK_CONTAINER:${Date.now()}`;
      const data = {
        name, container_type: containerType, color,
        qr_code_value: qrValue,
        ...(locationId && { location_id: locationId }),
        ...(projectId && { project_id: projectId }),
        ...(shortCode && { short_code: shortCode }),
        ...(description && { description }),
      };
      return base44.entities.StorageContainer.create(data);
    },
    onSuccess: (container) => {
      queryClient.invalidateQueries({ queryKey: ['storageContainers'] });
      setCreatedContainer(container);
      toast.success(`Container "${name}" created`);
    },
    onError: (e) => toast.error('Failed to create container: ' + e.message),
  });

  const handlePrintQR = () => {
    if (!createdContainer) return;
    const qrSvg = renderQRSVGString(createdContainer.qr_code_value, 140);
    const loc = locations.find(l => l.id === createdContainer.location_id);
    const html = `<!DOCTYPE html><html><head><title>Container Label</title><style>@page{size:4in 2in;margin:0.15in}body{font-family:Arial,sans-serif;margin:0;padding:8px}.label{display:flex;gap:12px;align-items:flex-start}.qr{flex-shrink:0}.info{flex:1}.name{font-size:18px;font-weight:bold;margin-bottom:4px}.type{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.code{font-size:24px;font-weight:bold;font-family:monospace;margin:6px 0}.loc{font-size:10px;color:#999;margin-top:4px}</style></head><body><div class="label"><div class="qr">${qrSvg}</div><div class="info"><div class="name">${createdContainer.name}</div><div class="type">Container · ${containerType}</div>${createdContainer.short_code ? `<div class="code">${createdContainer.short_code}</div>` : ''}${loc ? `<div class="loc">${loc.location_area}</div>` : ''}</div></div></body></html>`;
    const w = window.open('', '_blank', 'width=500,height=300');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close(); }; }
  };

  // Success state — show print option
  if (createdContainer) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
          <DialogHeader><DialogTitle>Container Created</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center py-4">
            <div className="text-4xl">📦</div>
            <p className="text-gray-300">{createdContainer.name}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handlePrintQR} className="gap-2">
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Blue Hardware Tote" className="bg-gray-800 border-gray-700 text-white mt-1" autoFocus />
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
              <Label className="text-gray-400">Short Code</Label>
              <Input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="BHT-1" className="bg-gray-800 border-gray-700 text-white mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-gray-400">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="Select location…" /></SelectTrigger>
              <SelectContent>
                {locations.filter(l => l.active !== false).sort((a, b) => (a.location_area || '').localeCompare(b.location_area || '')).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {projects.length > 0 && (
            <div>
              <Label className="text-gray-400">Project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-gray-400">Description</Label>
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