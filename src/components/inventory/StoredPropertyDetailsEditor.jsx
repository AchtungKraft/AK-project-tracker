import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPES=[
  ['unidentified','Unidentified'],['miscellaneous','Miscellaneous / grouped hardware'],
  ['take_off','Take-off'],['client_supplied','Client supplied'],
  ['spare','Spare'],['other','Other'],
];
const CONDITIONS=[['unknown','Not assessed'],['new','New'],['used','Used'],['damaged','Damaged'],['mixed','Mixed']];
const unwrap=r=>r?.data||r;

/** Physical property metadata only; nothing in here can create or modify stock inventory. */
export default function StoredPropertyDetailsEditor({container,property,onClose,onSaved}){
  const [name,setName]=useState(property.name||'');
  const [type,setType]=useState(property.property_type||'unidentified');
  const [condition,setCondition]=useState(property.condition||'unknown');
  const [description,setDescription]=useState(property.description||'');
  const [notes,setNotes]=useState(property.notes||'');
  const [qty,setQty]=useState(property.quantity_known?String(property.quantity):'');
  const [busy,setBusy]=useState(false);

  const save=async()=>{
    if(busy)return;
    if(!name.trim()){toast.error('Enter a name or description');return;}
    if(qty.trim()!==''&&(!Number.isFinite(Number(qty))||Number(qty)<=0||Number(qty)>99999)){
      toast.error('Quantity must be a positive number or left empty');return;
    }
    setBusy(true);
    try{
      const res=unwrap(await base44.functions.invoke('storageProperty',{
        action:'update_group',container_id:container.id,property_id:property.id,
        name:name.trim(),property_type:type,condition,description:description.trim(),
        notes:notes.trim(),quantity_known:qty.trim()!=='',
        quantity:qty.trim()===''?null:Number(qty),
      }));
      if(res?.error||!res?.success)throw new Error(res?.error||'Could not update property');
      onSaved?.();
      toast.success('Stored property details updated');
      onClose?.();
    }catch(err){toast.error(err.message||'Update failed');}
    finally{setBusy(false);}
  };
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose?.()}}>
    <DialogContent className="w-[calc(100vw-16px)] max-w-lg max-h-[90dvh] flex flex-col overflow-hidden bg-gray-900 border-gray-700 text-white p-4 sm:p-6">
      <DialogHeader><DialogTitle>Edit Stored Property</DialogTitle></DialogHeader>
      <p className="text-xs text-gray-400">Details can be updated after packing. This is a physical-property record, not stock inventory.</p>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        <div><Label htmlFor="stored-property-name">Name / description</Label>
          <Input id="stored-property-name" value={name} maxLength={150} disabled={busy}
            onChange={e=>setName(e.target.value)} placeholder="E.g. old dashboard hardware" className="mt-1"/></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Type</Label><Select value={type} onValueChange={setType} disabled={busy}>
            <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>
              {TYPES.map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent></Select></div>
          <div><Label>Condition</Label><Select value={condition} onValueChange={setCondition} disabled={busy}>
            <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger><SelectContent>
              {CONDITIONS.map(([id,label])=><SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent></Select></div>
        </div>
        <div><Label htmlFor="stored-property-qty">Known quantity (optional)</Label>
          <Input id="stored-property-qty" value={qty} onChange={e=>setQty(e.target.value)}
            type="number" inputMode="decimal" min="0.01" max="99999" disabled={busy}
            placeholder="Leave blank if unknown" className="mt-1"/>
          <p className="text-xs text-gray-500 mt-1">An empty quantity means uncounted, not zero stock.</p></div>
        <div><Label htmlFor="stored-property-description">Contents / description</Label>
          <Textarea id="stored-property-description" rows={3} maxLength={1200} value={description}
            disabled={busy} onChange={e=>setDescription(e.target.value)} className="mt-1" /></div>
        <div><Label htmlFor="stored-property-notes">Additional notes</Label>
          <Textarea id="stored-property-notes" rows={2} maxLength={1200} value={notes}
            disabled={busy} onChange={e=>setNotes(e.target.value)} className="mt-1" /></div>
      </div>
      <div className="shrink-0 border-t border-gray-700 pt-3 flex gap-2" style={{paddingBottom:'env(safe-area-inset-bottom, 0px)'}}>
        <Button variant="outline" className="flex-1 h-11" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button className="flex-1 h-11" disabled={busy||!name.trim()} onClick={save}>
          {busy&&<Loader2 className="w-4 h-4 mr-1 animate-spin"/>}Save Details
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
