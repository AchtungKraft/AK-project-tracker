import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, MapPin, PackageCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

/**
 * Reserved-label activation supports an existing project OR a client-only box.
 * Ownership is always validated and resolved from server records on activation.
 */
export default function ReservedStorageLabelActivation({ container, locations = [], projects = [], onActivated, onCancel }) {
  const [mode,setMode] = useState('project');
  const [projectId,setProjectId] = useState('');
  const [clientId,setClientId] = useState('');
  const [clients,setClients] = useState([]);
  const [clientError,setClientError] = useState('');
  const [clientsLoading,setClientsLoading] = useState(false);
  const [locationId,setLocationId] = useState('');
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);

  const project = projects.find(p=>p.id===projectId);
  const allowedLocations = useMemo(()=>locations.filter(l=>l.active!==false && (!l.project_id || (mode==='project' && l.project_id===projectId))),[locations,mode,projectId]);
  const validOwner = mode==='project' ? Boolean(projectId) : Boolean(clientId);

  useEffect(()=>{
    if(mode!=='client')return;
    let active=true;
    setClientsLoading(true);
    base44.functions.invoke('storageLabels',{action:'list_clients'})
      .then(raw=>{
        if(!active)return;
        const data=raw?.data||raw;
        if(data?.error||!data?.success)throw new Error(data?.error||'Unable to load client accounts');
        setClients(data.clients||[]);
        setClientError('');
      })
      .catch(error=>{if(active)setClientError(error.message||'Client Account list unavailable');})
      .finally(()=>{if(active)setClientsLoading(false);});
    return ()=>{active=false;};
  },[mode]);

  const switchMode=next=>{
    if(busy)return;
    setMode(next);setProjectId('');setClientId('');setLocationId('');
  };

  const activate = async () => {
    if(!validOwner||!locationId||busy)return;
    setBusy(true);
    try {
      const response = await base44.functions.invoke('storageLabels',{
        action:'activate',label_id:container.id,
        ...(mode==='project'?{project_id:projectId}:{client_account_id:clientId}),
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
      <p className="text-xs text-gray-400 mt-1">Assign an owner or project and physical location. This never creates stock inventory.</p>
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Box association">
        <Button type="button" size="sm" variant={mode==='project'?'default':'outline'} disabled={busy}
          onClick={()=>switchMode('project')} className="h-10">Project Box</Button>
        <Button type="button" size="sm" variant={mode==='client'?'default':'outline'} disabled={busy}
          onClick={()=>switchMode('client')} className="h-10">Client-Only Box</Button>
      </div>
      {mode==='project' ? <>
        <label className="block text-sm text-gray-300">Project *
          <Select value={projectId} onValueChange={id=>{setProjectId(id);setLocationId('')}} disabled={busy}>
            <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select project"/></SelectTrigger>
            <SelectContent>{projects.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        {project && !project.client_account_id && <p className="text-xs text-yellow-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0"/>
          This project has no Client Account; ownership remains unknown. For standalone client-owned property, select Client-Only Box.
        </p>}
      </> : <>
        <label className="block text-sm text-gray-300">Client Account *
          <Select value={clientId} onValueChange={setClientId} disabled={busy||clientsLoading||!!clientError}>
            <SelectTrigger className="mt-1 h-11"><SelectValue placeholder={clientsLoading?'Loading clients…':'Select client'}/></SelectTrigger>
            <SelectContent>{clients.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        {clientError&&<p className="text-xs text-red-400">{clientError}. Switch modes and back to retry.</p>}
      </>}
      <label className="block text-sm text-gray-300">Physical location *
        <Select value={locationId} onValueChange={setLocationId} disabled={busy}>
          <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select location"/></SelectTrigger>
          <SelectContent>{allowedLocations.map(l=><SelectItem key={l.id} value={l.id}>{l.location_area}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      <label className="block text-sm text-gray-300">Box description (optional)
        <Input value={name} onChange={e=>setName(e.target.value)} maxLength={100}
          placeholder="Interior trim and loose hardware" disabled={busy} className="mt-1 h-11"/>
      </label>
      <div className="border border-gray-800 rounded-md p-3 text-xs text-gray-400 space-y-1">
        <p className="flex gap-1"><MapPin className="w-3.5 h-3.5 shrink-0"/>Moving the box does not change its QR code or owner.</p>
        <p className="flex gap-1"><PackageCheck className="w-3.5 h-3.5 shrink-0"/>Photographed property stays separate from Parts Tracker stock.</p>
      </div>
    </div>
    <div className="p-4 border-t border-gray-800 space-y-2" style={{paddingBottom:'calc(env(safe-area-inset-bottom, 0px) + 16px)'}}>
      <Button onClick={activate} disabled={busy||!validOwner||!locationId} className="w-full h-12">
        {busy&&<Loader2 className="w-4 h-4 mr-2 animate-spin"/>} Activate Box
      </Button>
      <Button onClick={onCancel} variant="outline" disabled={busy} className="w-full h-11">Scan Another</Button>
    </div>
  </div>;
}
