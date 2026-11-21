import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Printer, Search, AlertTriangle } from "lucide-react";

/** Select exactly `quantity` existing containers for the shared tote label studio. Never creates containers or identifiers. */
export default function ContainerLabelPicker({ containers = [], quantity = 3, onContinue }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const usable = useMemo(() => containers.filter(c => c.active !== false && c.status !== 'archived' && c.qr_code_value && c.short_code), [containers]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usable.filter(c => !q || `${c.name} ${c.short_code}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(0, 150);
  }, [usable, search]);
  // Keep only selections that still fit the chosen quantity (selection order preserved).
  const picked = [...selected].slice(0, quantity);
  const pickedSet = new Set(picked);
  const missing = quantity - picked.length;
  const full = missing === 0;
  const toggle = (id) => setSelected(() => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id); else if (n.size < quantity) n.add(id);
    return n;
  });
  const go = () => {
    if (!full) return;
    const byId = new Map(usable.map(c => [c.id, c]));
    onContinue(picked.map(id => byId.get(id)).filter(Boolean));
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find container by name or number" className="h-9 pl-9 bg-gray-950 border-gray-700" />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {shown.length === 0 && <p className="text-xs text-gray-500">No printable containers.</p>}
        {shown.map(c => {
          const on = pickedSet.has(c.id);
          const locked = !on && full;
          return (
            <label key={c.id} className={`flex items-center gap-2 border border-gray-800 rounded-md p-2 ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-600'}`}>
              <Checkbox checked={on} disabled={locked} onCheckedChange={() => toggle(c.id)} />
              <span className="text-sm truncate flex-1">{c.name}</span>
              <span className="text-[11px] font-mono text-gray-400">{c.short_code}</span>
            </label>
          );
        })}
      </div>
      <p className={`text-xs flex items-center gap-1.5 ${full ? 'text-green-400' : 'text-amber-400'}`}>
        {!full && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
        {picked.length} of {quantity} selected{full ? '' : ` · ${missing} more needed to fill ${quantity / 3} sheet${quantity > 3 ? 's' : ''}`}
      </p>
      {usable.length < quantity && <p className="text-xs text-amber-400">Only {usable.length} printable container{usable.length === 1 ? '' : 's'} available. No new containers will be created.</p>}
      <Button disabled={!full} onClick={go} className="w-full gap-2">
        <Printer className="w-4 h-4" /> Label {quantity} selected containers
      </Button>
    </div>
  );
}