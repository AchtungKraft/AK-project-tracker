import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Printer, Search } from "lucide-react";

/** Select existing containers to print with the shared tote label studio. */
export default function ContainerLabelPicker({ containers = [], onContinue }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const usable = useMemo(() => containers.filter(c => c.active !== false && c.status !== 'archived' && c.qr_code_value && c.short_code), [containers]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usable.filter(c => !q || `${c.name} ${c.short_code}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(0, 150);
  }, [usable, search]);
  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find container by name or number" className="h-9 pl-9 bg-gray-950 border-gray-700" />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {shown.length === 0 && <p className="text-xs text-gray-500">No printable containers.</p>}
        {shown.map(c => (
          <label key={c.id} className="flex items-center gap-2 border border-gray-800 rounded-md p-2 cursor-pointer hover:border-gray-600">
            <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
            <span className="text-sm truncate flex-1">{c.name}</span>
            <span className="text-[11px] font-mono text-gray-400">{c.short_code}</span>
          </label>
        ))}
      </div>
      <Button disabled={!selected.size || selected.size > 50} onClick={() => onContinue(usable.filter(c => selected.has(c.id)))} className="w-full gap-2">
        <Printer className="w-4 h-4" /> Label {selected.size} selected container{selected.size === 1 ? '' : 's'}
      </Button>
    </div>
  );
}