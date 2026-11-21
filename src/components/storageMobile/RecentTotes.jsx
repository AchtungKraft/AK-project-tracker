import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { storageMobile } from "@/lib/storageMobileApi";
import ToteRow from "./ToteRow";

/** The signed-in user's own recently opened totes. */
export default function RecentTotes({ act, title = 'Recent totes' }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['storageMobileRecent'],
    queryFn: () => storageMobile('recent').then((d) => d.containers || []),
    staleTime: 30_000,
  });
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : isError ? (
        <p className="text-sm text-amber-400">{error.message}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">Totes you open will show up here.</p>
      ) : (
        <div className="space-y-2">{data.map((t) => <ToteRow key={t.id} tote={t} act={act} />)}</div>
      )}
    </section>
  );
}