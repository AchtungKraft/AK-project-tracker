import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { storageMobile } from "@/lib/storageMobileApi";
import ReservedStorageLabelActivation from "@/components/inventory/ReservedStorageLabelActivation";

/** A preprinted label that was never activated: reuse the existing activation form. */
export default function ReservedLabelActivation({ label, onActivated, onCancel }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['storageMobileActivationOptions'],
    queryFn: async () => {
      const [loc, projects] = await Promise.all([
        storageMobile('locations'),
        base44.entities.Project.list('name', 500),
      ]);
      return { locations: loc.locations || [], projects };
    },
    staleTime: 60_000,
  });
  if (isLoading) return <div className="flex-1 flex items-center justify-center gap-2 text-gray-300"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>;
  if (isError) return <div className="flex-1 flex items-center justify-center p-6 text-center text-amber-400">{error.message}</div>;
  return (
    <div className="flex-1 overflow-y-auto">
      <ReservedStorageLabelActivation container={label} locations={data.locations} projects={data.projects}
        onActivated={onActivated} onCancel={onCancel} />
    </div>
  );
}