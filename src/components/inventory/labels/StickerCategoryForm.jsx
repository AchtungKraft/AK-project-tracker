import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { PRESET_COLORS, normalizeHex } from "./labelColors";
import StickerCategoryPreview from "./StickerCategoryPreview";

export default function StickerCategoryForm({ category, onSave, onCancel }) {
  const [name, setName] = useState(category?.name || '');
  const [hex, setHex] = useState(category?.color || '#0d9488');
  const [active, setActive] = useState(category ? category.active !== false : true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = normalizeHex(hex);
  const isGeneral = category?.key === 'general';

  const submit = async () => {
    if (!name.trim()) return setError('Category name is required');
    if (!valid || !/^#?[0-9a-f]{6}$/i.test(hex.trim())) return setError('Enter a 6-digit HEX color like #2563eb');
    setSaving(true); setError('');
    try { await onSave({ id: category?.id, name: name.trim(), color: valid, active }); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 rounded-md border border-gray-700 bg-gray-900/60 p-3">
      <p className="text-sm font-semibold">{category ? `Edit ${category.name}` : 'Add category'}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Category name</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="h-9 bg-gray-950 border-gray-700" />
          <label className="text-xs text-gray-400 block">Print color</label>
          <div className="flex gap-2">
            <input type="color" value={valid || '#6b7280'} onChange={e => setHex(e.target.value)} aria-label="Pick color"
              className="w-10 h-9 rounded border border-gray-700 bg-transparent shrink-0" />
            <Input value={hex} onChange={e => setHex(e.target.value)} className="h-9 font-mono bg-gray-950 border-gray-700" />
          </div>
          <div className="flex flex-wrap gap-1">
            {PRESET_COLORS.map(p => (
              <button key={p.hex} type="button" title={p.name} onClick={() => setHex(p.hex)}
                className="w-6 h-6 rounded-sm border border-gray-600" style={{ backgroundColor: p.hex }} />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm pt-1">
            <Switch checked={active} onCheckedChange={setActive} disabled={isGeneral} /> {active ? 'Active' : 'Inactive'}
          </label>
          {isGeneral && <p className="text-[11px] text-gray-500">General Storage is the fallback and always stays active.</p>}
        </div>
        <StickerCategoryPreview name={name} color={hex} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save</Button>
      </div>
    </div>
  );
}