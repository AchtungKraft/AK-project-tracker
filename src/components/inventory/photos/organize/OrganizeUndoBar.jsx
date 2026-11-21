import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2 } from "lucide-react";
import { fetchLastOrganize, undoOrganize } from "@/lib/photoOrganizeApi";
import { useOrganizeRunner } from "./useOrganizeRunner";

const LABEL = {
  group_new: (n) => `Grouped ${n} ${n === 1 ? 'photo' : 'photos'} as a new item`,
  group_existing: (n) => `Added ${n} ${n === 1 ? 'photo' : 'photos'} to an item`,
  unsort: (n) => `Returned ${n} ${n === 1 ? 'photo' : 'photos'} to Unsorted`,
  individual: (n) => `Made ${n} individual ${n === 1 ? 'item' : 'items'}`,
};

/** One-line Undo for the most recent organizing action, shown only while it is still safe. */
export default function OrganizeUndoBar({ containerId }) {
  const { data: op } = useQuery({
    queryKey: ['storageLastOrganize', containerId], queryFn: () => fetchLastOrganize(containerId),
    staleTime: 60_000, refetchOnWindowFocus: false, retry: 0,
  });
  const { busy, run } = useOrganizeRunner(containerId);
  if (!op?.eligible || !LABEL[op.operation]) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-800 bg-gray-900/50 px-3 py-1.5">
      <span className="flex-1 min-w-0 truncate text-xs text-gray-400">{LABEL[op.operation](op.moved)}</span>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => undoOrganize(containerId, op.event_id), 'Undone: previous photo arrangement restored')}
        className="h-8 gap-1 text-xs text-gray-200">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Undo
      </Button>
    </div>
  );
}