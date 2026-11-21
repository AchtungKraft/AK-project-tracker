import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OrganizeSheet from "./OrganizeSheet";

/** Edit details on the canonical content entry. Closing with unsaved changes asks first. */
export default function EntryDetailsDialog({ entry, busy, onSubmit, onClose }) {
  const initial = {
    name: entry.name || '', quantity: entry.quantity_known ? String(entry.quantity) : '',
    description: entry.description || '', notes: entry.notes || '',
  };
  const [name, setName] = useState(initial.name);
  const [quantity, setQuantity] = useState(initial.quantity);
  const [description, setDescription] = useState(initial.description);
  const [notes, setNotes] = useState(initial.notes);
  const qty = quantity === '' ? null : Number(quantity);
  const qtyBad = qty != null && (!Number.isFinite(qty) || qty <= 0);
  const dirty = name !== initial.name || quantity !== initial.quantity || description !== initial.description || notes !== initial.notes;
  const submit = () => onSubmit({
    name: name.trim() || 'Unidentified Item', description, notes,
    quantity_known: qty != null, ...(qty != null ? { quantity: qty } : {}),
  });
  const close = () => { if (!dirty || window.confirm('Discard your unsaved changes?')) onClose(); };
  return (
    <OrganizeSheet title="Edit Details" busy={busy} confirmLabel="Save" confirmDisabled={qtyBad || !dirty} onConfirm={submit} onClose={close}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="h-10" aria-label="Item name" />
      <Input type="number" inputMode="decimal" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity (blank = uncounted)" className="h-10" aria-label="Quantity" />
      {qtyBad && <p className="text-xs text-red-400">Quantity must be a positive number.</p>}
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} aria-label="Description" />
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (e.g. Fragile, Customer supplied)" rows={2} aria-label="Notes" />
    </OrganizeSheet>
  );
}