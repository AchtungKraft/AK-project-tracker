import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BadgeCheck, Check, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchCatalogParts } from "@/lib/photoOrganizeApi";
import OrganizeSheet from "./OrganizeSheet";

/** Identify as Part: pick an existing catalog part, then confirm. Identification only, never inventory.
 *  Stays open until the server confirms the save; errors show inline. */
export default function IdentifyPartDialog({ entryName, currentPart, linked, busy, error, onLink, onClose }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const [pending, setPending] = useState(null); // 'link' | 'unlink'
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const { data: parts = [], isFetching, isError } = useQuery({
    queryKey: ['catalogPartSearch', q], queryFn: () => searchCatalogParts(q), enabled: q.length >= 2, staleTime: 60_000,
  });
  const pick = (p) => { document.activeElement?.blur?.(); setPicked(p); };
  const save = (id, kind) => { setPending(kind); onLink(id); };

  return (
    <OrganizeSheet title="Identify as Part" description={entryName} busy={busy} onClose={onClose}
      className="top-3 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] max-h-[85dvh]">
      {linked && (
        <div className="flex items-center gap-2 rounded border border-blue-900/60 bg-blue-950/30 p-2 text-xs text-blue-200">
          <BadgeCheck className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0 line-clamp-2">Identified: {currentPart || 'Catalog part'}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => save(null, 'unlink')} className="h-9 text-xs gap-1">
            {busy && pending === 'unlink' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Remove match
          </Button>
        </div>
      )}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="search"
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Search catalog by name or part number" className="h-11 pl-8" />
      </div>
      {picked && (
        <div className="space-y-2 rounded-lg border border-red-800/70 bg-red-950/20 p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-gray-400">Selected part</div>
          <div className="text-sm font-semibold text-white line-clamp-2">{picked.part_name || 'Unnamed part'}</div>
          {picked.vendor_part_number && <div className="text-[11px] text-gray-400">{picked.vendor_part_number}</div>}
          <Button onClick={() => save(picked.id, 'link')} disabled={busy} className="w-full h-11 gap-2">
            {busy && pending === 'link' && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy && pending === 'link' ? 'Saving part match…' : 'Save part match'}
          </Button>
        </div>
      )}
      {error && <p className="rounded border border-red-900/60 bg-red-950/30 p-2 text-xs text-red-200">Not saved: {error}</p>}
      <p className="text-[11px] text-yellow-200/80">Identification only. Does not create stock, purchase orders, demand or allocations.</p>
      {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      {isError && <p className="text-xs text-red-400">Catalog search failed. Try again.</p>}
      {q.length >= 2 && !isFetching && !isError && !parts.length && <p className="text-xs text-gray-500">No catalog parts match "{q}".</p>}
      <div className="max-h-[40dvh] overflow-y-auto overscroll-contain space-y-1">
        {parts.map((p) => {
          const on = picked?.id === p.id;
          return (
            <button key={p.id} type="button" disabled={busy} onClick={() => pick(p)} aria-pressed={on}
              className={cn("flex w-full items-start gap-2 text-left rounded-md border p-2 min-h-[44px]",
                on ? "border-red-500 bg-red-950/30" : "border-gray-800 bg-gray-900/40 active:bg-gray-800")}>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-100 line-clamp-2">{p.part_name || 'Unnamed part'}</span>
                {p.vendor_part_number && <span className="block text-[11px] text-gray-500 truncate">{p.vendor_part_number}</span>}
              </span>
              {on && <Check className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />}
            </button>
          );
        })}
      </div>
    </OrganizeSheet>
  );
}