import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import OrganizeSheet from "./OrganizeSheet";
import ReassignNotice, { isBlocked } from "./ReassignNotice";

/** Group as Item: put the selected photos into one new or existing content entry. */
export default function GroupPhotosDialog({ info, entries, busy, onSubmit, onClose }) {
  const [mode, setMode] = useState('new');
  const [targetId, setTargetId] = useState(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');
  const target = mode === 'existing' ? targetId : null;
  const qty = quantity === '' ? null : Number(quantity);
  const qtyBad = qty != null && (!Number.isFinite(qty) || qty <= 0);
  const submit = () => onSubmit(mode === 'new'
    ? { operation: 'group_new', name, quantity: qty, description }
    : { operation: 'group_existing', target_property_id: targetId });
  const tab = (key, label) => (
    <button type="button" onClick={() => setMode(key)} className={cn("flex-1 h-9 rounded-md border text-xs font-medium",
      mode === key ? "bg-red-600 border-red-600 text-white" : "border-gray-700 text-gray-300")}>{label}</button>
  );
  return (
    <OrganizeSheet title="Group as Item" description={`${info.count} ${info.count === 1 ? 'photo' : 'photos'} will belong to one documented item. Photo files stay as they are.`}
      busy={busy} confirmLabel="Save" onConfirm={submit} onClose={onClose}
      confirmDisabled={qtyBad || isBlocked(info, target) || (mode === 'existing' && !targetId)}>
      {entries.length > 0 && <div className="flex gap-2">{tab('new', 'New item')}{tab('existing', 'Add to existing item')}</div>}
      {mode === 'new' ? (
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name (optional): Unidentified Item" className="h-10" />
          <Input type="number" inputMode="decimal" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity (optional)" className="h-10" />
          {qtyBad && <p className="text-xs text-red-400">Quantity must be a positive number.</p>}
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} />
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1" role="radiogroup">
          {entries.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={targetId === e.id} onClick={() => setTargetId(e.id)}
              className={cn("w-full text-left rounded-md border p-2 min-h-[48px]", targetId === e.id ? "border-red-500 bg-red-950/30" : "border-gray-800 bg-gray-900/40")}>
              <span className="block text-sm text-gray-100 truncate">{e.name}</span>
              <span className="block text-[11px] text-gray-500">{e.photo_count || 0} photos · {e.quantity_known ? `Qty ${e.quantity}` : 'Qty uncounted'}{e.catalog_part_id ? ' · Identified' : ''}</span>
            </button>
          ))}
        </div>
      )}
      <ReassignNotice info={info} targetId={target} />
    </OrganizeSheet>
  );
}