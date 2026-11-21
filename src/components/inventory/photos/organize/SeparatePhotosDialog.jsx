import { useState } from "react";
import { Inbox, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import OrganizeSheet from "./OrganizeSheet";
import ReassignNotice, { isBlocked } from "./ReassignNotice";

/** Separate: return photos to Unsorted, or make one item per photo. Files are never copied. */
export default function SeparatePhotosDialog({ info, busy, onSubmit, onClose }) {
  const [choice, setChoice] = useState(info.grouped ? 'unsort' : 'individual');
  const options = [
    { key: 'unsort', icon: Inbox, label: 'Return to Unsorted', text: 'Detach the photos from their item. They stay in this tote.', disabled: !info.grouped },
    { key: 'individual', icon: Layers, label: 'Create Individual Items', text: 'One new item per photo. Add names and details later.' },
  ];
  const note = choice === 'unsort' && info.unsorted ? `${info.unsorted} already unsorted ${info.unsorted === 1 ? 'photo is' : 'photos are'} left as is.` : null;
  return (
    <OrganizeSheet title="Separate" description={`${info.count} ${info.count === 1 ? 'photo' : 'photos'} selected.`}
      busy={busy} confirmLabel={choice === 'unsort' ? 'Return to Unsorted' : 'Create Items'}
      confirmDisabled={isBlocked(info)} onConfirm={() => onSubmit({ operation: choice })} onClose={onClose}>
      <div className="space-y-2" role="radiogroup">
        {options.map(({ key, icon: Icon, label, text, disabled }) => (
          <button key={key} type="button" role="radio" aria-checked={choice === key} disabled={disabled} onClick={() => setChoice(key)}
            className={cn("w-full flex gap-3 text-left rounded-md border p-3", choice === key ? "border-red-500 bg-red-950/30" : "border-gray-800 bg-gray-900/40")}>
            <Icon className="w-5 h-5 mt-0.5 text-gray-300 shrink-0" />
            <span><span className="block text-sm font-medium text-gray-100">{label}</span><span className="block text-xs text-gray-400">{disabled ? 'None of the selected photos belong to an item.' : text}</span></span>
          </button>
        ))}
      </div>
      {note && <p className="text-xs text-gray-500">{note}</p>}
      <ReassignNotice info={info} />
    </OrganizeSheet>
  );
}