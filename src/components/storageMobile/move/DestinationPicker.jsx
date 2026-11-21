import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, ScanLine, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { storageMobile } from "@/lib/storageMobileApi";
import { useDebounced } from "../useDebounced";

/** Find the destination tote by search, tote number, or scanning its label. */
export default function DestinationPicker({ sourceId, onPick, onScan }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['storageMobileSearch', q, 0],
    queryFn: () => storageMobile('search', { q, page: 0 }),
    enabled: q.length >= 2, staleTime: 30_000,
  });
  const results = (data?.results || []).filter((t) => t.id !== sourceId);
  return (
    <div className="space-y-2">
      <Button onClick={onScan} className="w-full h-11 gap-2"><ScanLine className="w-5 h-5" /> Scan destination tote</Button>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tote number, name or location" className="h-10 pl-8" />
      </div>
      {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      {isError && <p className="text-xs text-red-400">{error.message}</p>}
      {q.length >= 2 && !isFetching && !isError && !results.length && <p className="text-xs text-gray-500">No other tote matches "{q}".</p>}
      <div className="max-h-64 overflow-y-auto space-y-1">
        {results.map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t)}
            className="block w-full text-left rounded-md border border-gray-800 bg-gray-900/40 px-2.5 py-2 min-h-[44px] active:bg-gray-800">
            {t.short_code && <span className="block font-mono text-[11px] font-semibold text-red-300 truncate">{t.short_code}</span>}
            <span className="block text-sm text-gray-100 truncate">{t.name}</span>
            <span className="flex items-center gap-1 text-[11px] text-gray-500 truncate"><MapPin className="w-3 h-3 shrink-0" />{t.location_path?.join(' › ') || 'No location'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}