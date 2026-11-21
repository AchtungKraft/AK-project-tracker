import { BadgeCheck, MapPin, PackageCheck } from "lucide-react";

const Row = ({ label, children }) => (
  <div className="flex gap-2 text-sm min-w-0"><span className="w-20 shrink-0 text-gray-500">{label}</span><span className="flex-1 min-w-0 text-gray-100 break-words">{children}</span></div>
);

/** Item facts: quantity, part, description, notes, current tote and location. */
export default function EntryDetailInfo({ entry, item, tote }) {
  const quantity = entry?.quantity_known ? entry.quantity : item.quantity;
  return (
    <div className="space-y-1.5 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <Row label="Quantity">{quantity != null ? quantity : <span className="text-gray-500">Not counted</span>}</Row>
      {item.inventory_linked ? (
        <Row label="Part"><span className="inline-flex items-center gap-1 text-amber-300"><PackageCheck className="w-4 h-4" />Tracked inventory</span></Row>
      ) : item.identified ? (
        <Row label="Part"><span className="inline-flex items-center gap-1 text-blue-200"><BadgeCheck className="w-4 h-4 shrink-0" />{item.part_name}</span></Row>
      ) : <Row label="Part"><span className="text-gray-500">Not identified</span></Row>}
      {(entry?.description || item.description) && <Row label="Description">{entry?.description || item.description}</Row>}
      {(entry?.notes || item.notes) && <Row label="Notes">{entry?.notes || item.notes}</Row>}
      <Row label="In tote">
        <span className="font-mono text-xs text-red-300">{tote.short_code}</span> {tote.name !== tote.short_code ? tote.name : ''}
        <span className="flex items-center gap-1 text-[11px] text-gray-400"><MapPin className="w-3 h-3 shrink-0" />{tote.location_path?.join(' › ') || 'No location'}</span>
      </Row>
    </div>
  );
}