import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, History, Loader2 } from "lucide-react";
import { fetchContentMoves } from "@/lib/contentMoveApi";
import { plural } from "./contents/contentLabels";

/** Contents moved into or out of this tote. Whole-tote moves keep their own history. */
export default function ContentMoveHistory({ containerId }) {
  const [open, setOpen] = useState(false);
  const { data: moves, isLoading, isError, error } = useQuery({
    queryKey: ['storageContentMoves', containerId], queryFn: () => fetchContentMoves(containerId), enabled: open, staleTime: 30_000,
  });
  return (
    <div className="rounded-lg border border-gray-800">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-gray-300">
        <History className="w-4 h-4 text-gray-500" /><span className="flex-1 text-left">Content move history</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-gray-800 px-3 py-2 space-y-2">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {isError && <p className="text-xs text-red-400">{error.message}</p>}
          {moves && !moves.length && <p className="text-xs text-gray-500">No contents have been moved in or out of this tote.</p>}
          {moves?.map((m) => {
            const Icon = m.direction === 'out' ? ArrowUpRight : ArrowDownLeft;
            const what = [m.entries ? plural(m.entries, 'item') : null, m.loose_photos ? plural(m.loose_photos, 'unsorted photo') : null].filter(Boolean).join(', ');
            return (
              <div key={m.id} className="flex gap-2 text-xs min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${m.direction === 'out' ? 'text-amber-400' : 'text-emerald-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-200">
                    {m.direction === 'out' ? 'Moved out to ' : 'Moved in from '}
                    <span className="font-mono text-red-300">{m.other_tote?.short_code || m.other_tote?.name}</span>: {what} ({plural(m.photos, 'photo')})
                  </div>
                  {m.entry_names.length > 0 && <div className="text-gray-500 truncate">{m.entry_names.join(', ')}</div>}
                  <div className="text-gray-500">{formatDistanceToNow(new Date(m.performed_at), { addSuffix: true })}{m.performed_by_name ? ` · ${m.performed_by_name}` : ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}