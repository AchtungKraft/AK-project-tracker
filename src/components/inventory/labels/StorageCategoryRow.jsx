import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PRESET_COLORS, normalizeHex } from "./labelColors";

export default function StorageCategoryRow({ category, disabled, onSave }) {
  const [name, setName] = useState(category.name);
  const [hex, setHex] = useState(category.color);
  const valid = normalizeHex(hex);
  const dirty = name.trim() !== category.name || (valid && valid !== normalizeHex(category.color));
  return (
    <div className="border border-gray-800 rounded-md p-2 space-y-2">
      <div className="flex gap-2 items-center">
        <input type="color" value={valid || '#6b7280'} onChange={e => setHex(e.target.value)}
          className="w-9 h-9 rounded border border-gray-700 bg-transparent shrink-0" aria-label="Pick color" />
        <Input value={name} onChange={e => setName(e.target.value)} className="h-9 bg-gray-950 border-gray-700" />
        <Input value={hex} onChange={e => setHex(e.target.value)} className="h-9 w-28 font-mono bg-gray-950 border-gray-700" />
        <Button size="sm" disabled={disabled || !dirty || !valid} onClick={() => onSave({ name, color: hex })} className="h-9">Save</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESET_COLORS.map(p => (
          <button key={p.hex} type="button" title={p.name} onClick={() => setHex(p.hex)}
            className="w-5 h-5 rounded-sm border border-gray-600" style={{ backgroundColor: p.hex }} />
        ))}
      </div>
    </div>
  );
}