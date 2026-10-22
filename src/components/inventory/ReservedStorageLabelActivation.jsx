import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, MapPin, PackageCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function ReservedStorageLabelActivation({ container, locations = [], projects = [], onActivated, onCancel }) {
  const [projectId,setProjectId] = useState('');
  const [locationId,setLocationId] = useState('');
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);

  const project = projects.find(p=>p.id===projectId);
  const allowedLocations = useMemo(()=>locations.filter(l=>l.active!==false && (!l.project_id || l.project_id===projectId)),[locations,projectId]);

  const activate = async () => {
    if(!projectId||!locationId||busy) return;
    setBusy(true);
    try {
      const response = await base44.functions.invoke('storageLabels',{
        action:'activate',label_id:container.id,project_id:projectId,
        location_id:locationId,name:name.trim(),
      });
      const result = response?.data || response;
      if(result?.error || !result?.success) throw new Error(result?.error || 'Activation failed');
      if(!result.audit_recorded) toast.warning('Box activated; custody audit needs review.');
      else toast.success(container.short_code + ' activated');
      onActivated?.(result.container);
    } catch(e) {toast.error(e.message||'Activation failed')}
    finally {setBusy(false)}
  };
  return <div className="flex flex-col h-full bg-gray-950 text-white">
    <div className="p-4 border-b border-gray-800">
      <p className="text-green-400 text-xs font-bold uppercase">Unused label recognized</p>
      <h2 className="text-xl font-bold font-mono mt-1">{container.short_code}</h2>
      <p className="text-xs text-gray-400 mt-1">Assign a project and location to activate this physical box. This does not create inventory.</p>
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <label className="block text-sm text-gray-300">Project *
        <Select value={projectId} onValueChange={id=>{setProjectId(id);setLocationId('')}}>
          <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select project"/></SelectTrigger>
          <SelectContent>{projects.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      {project && !project.client_account_id && <p className="text-xs text-yellow-300 flex items-start gap-2"><ShieldAlert className="w-4 h-4 shrink-0"/>This project has no Client Account assigned. The box can be activated, but client ownership will remain unassigned until that is corrected.</p>}
      <label className="block text-sm text-gray-300">Physical location *
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select location"/></SelectTrigger>
          <SelectContent>{allowedLocations.map(l=><SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      <label className="block text-sm text-gray-300">Box description (optional)
        <Input value={name} onChange={e=>setName(e.target.value)} maxLength={100} placeholder="Interior trim and loose hardware" className="mt-1 h-11"/>
      </label>
      <div className="border border-gray-800 rounded-md p-3 text-xs text-gray-400 space-y-1">
        <p className="flex gap-1"><MapPin className="w-3.5 h-3.5"/>Location can change without changing the QR code.</p>
        <p className="flex gap-1"><PackageCheck className="w-3.5 h-3.5"/>Box remains outside Part inventory until explicit intake.</p>
      </div>
    </div>
    <div className="p-4 border-t border-gray-800 space-y-2" style={{paddingBottom:'calc(env(safe-area-inset-bottom, 0px) + 16px)'}}>
      <Button onClick={activate} disabled={busy||!projectId||!locationId} className="w-full h-12">{busy&&<Loader2 className="w-4 h-4 mr-2 animate-spin"/>} Activate Box</Button>
      <Button onClick={onCancel} variant="outline" disabled={busy} className="w-full h-11">Scan Another</Button>
    </div>
  </div>;
}
