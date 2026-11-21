import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { searchCatalogParts } from "@/lib/photoOrganizeApi";
import OrganizeSheet from "./OrganizeSheet";

/** Identify as Part: link the item to an existing catalog part. Identification only, never inventory. */
export default function IdentifyPartDialog({ entryName, currentPart, linked, busy, onLink, onClose }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const { data: parts = [], isFetching, isError } = useQuery({
    queryKey: ['catalogPartSearch', q], queryFn: () => searchCatalogParts(q), enabled: q.length >= 2, staleTime: 60_000,
  });
  return (
    <OrganizeSheet title="Identify as Part" description={entryName} busy={busy} onClose={onClose}>
      {linked && (
        <div className="flex items-center gap-2 rounded border border-blue-900/60 bg-blue-950/30 p-2 text-xs text-blue-200">
          <span className="flex-1 min-w-0 truncate">Currently: {currentPart || 'Catalog part linked'}</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onLink(null)} className="h-8 text-xs">Remove match</Button>
        </div>
      )}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search catalog by name or part number" className="h-10 pl-8" />
      </div>
      <p className="text-[11px] text-yellow-200/80">Identification only. Does not create stock, purchase orders, demand or allocations.</p>
      {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      {isError && <p className="text-xs text-red-400">Catalog search failed. Try again.</p>}
      {q.length >= 2 && !isFetching && !isError && !parts.length && <p className="text-xs text-gray-500">No catalog parts match "{q}".</p>}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {parts.map((p) => (
          <button key={p.id} type="button" disabled={busy} onClick={() => onLink(p.id)}
            className="block w-full text-left rounded-md border border-gray-800 bg-gray-900/40 p-2 min-h-[44px] hover:border-gray-600">
            <span className="block text-sm text-gray-100 line-clamp-2">{p.part_name || 'Unnamed part'}</span>
            {p.vendor_part_number && <span className="block text-[11px] text-gray-500 truncate">{p.vendor_part_number}</span>}
          </button>
        ))}
      </div>
    </OrganizeSheet>
  );
}