import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { storageMobile } from "@/lib/storageMobileApi";
import { useDebounced } from "../useDebounced";
import TotePrintStudio from "./TotePrintStudio";

/** Search an existing tote by number or name, then reprint its sticker. */
export default function ReprintStickerPanel() {
  const [text, setText] = useState('');
  const [tote, setTote] = useState(null);
  const q = useDebounced(text.trim(), 300);
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['storageMobileSearch', q, 0],
    queryFn: () => storageMobile('search', { q, page: 0 }),
    enabled: q.length >= 2 && !tote, staleTime: 30_000,
  });
  if (tote) return (
    <div className="space-y-3">
      <button type="button" onClick={() => setTote(null)} className="flex items-center gap-1 text-sm text-gray-300 min-h-[40px]">
        <ArrowLeft className="w-4 h-4" /> Choose another tote
      </button>
      <TotePrintStudio key={tote.id} tote={tote} returnTo="/storage?print=reprint" />
    </div>
  );
  const results = data?.results || [];
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Tote number or name" className="h-11 pl-8" />
      </div>
      {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      {isError && <p className="text-xs text-red-400">{error.message}</p>}
      {q.length >= 2 && !isFetching && !isError && !results.length && <p className="text-sm text-gray-500">No totes match "{q}".</p>}
      <div className="space-y-1.5">
        {results.map((t) => (
          <button key={t.id} type="button" onClick={() => setTote(t)}
            className="block w-full text-left rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5 min-h-[52px] active:bg-gray-800">
            {t.short_code && <span className="block font-mono text-xs font-semibold text-red-300 truncate">{t.short_code}</span>}
            <span className="block text-[15px] text-white truncate">{t.name}</span>
            <span className="flex items-center gap-1 text-xs text-gray-500 truncate"><MapPin className="w-3 h-3 shrink-0" />{t.location_path?.join(' › ') || 'No location'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}