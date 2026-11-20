import { Input } from "@/components/ui/input";
import CategorySelect from "./CategorySelect";

export default function ToteLabelEditorRow({ draft, categories, onChange }) {
  const nameEdited = draft.container_id && draft.name.trim() !== draft.saved_name;
  const catEdited = draft.container_id && draft.category_id !== draft.saved_category_id;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem] gap-2 items-center border border-gray-800 rounded-md p-2">
      <div className="min-w-0">
        <div className="text-[11px] font-mono text-gray-400 truncate" title={draft.short_code}>{draft.short_code}</div>
        {!draft.qr_code_value && <div className="text-[11px] text-red-400">No QR identity — cannot print</div>}
      </div>
      <div className="min-w-0">
        <Input value={draft.name} maxLength={100} placeholder={draft.container_id ? "Tote name" : "Blank: write-in name line"}
          onChange={e => onChange({ name: e.target.value })} className="h-9 bg-gray-950 border-gray-700" />
        {nameEdited && <div className="text-[10px] text-amber-400 mt-0.5">Print-only until saved</div>}
      </div>
      <div>
        <CategorySelect categories={categories} value={draft.category_id} onChange={id => onChange({ category_id: id })} />
        {catEdited && <div className="text-[10px] text-amber-400 mt-0.5">Print-only until saved</div>}
      </div>
    </div>
  );
}