import { Link } from "react-router-dom";
import { ChevronRight, MapPin } from "lucide-react";
import { toteUrl } from "@/lib/storageMobileApi";

/** One tappable tote: number, name, where it is, who it belongs to and why it matched. */
export default function ToteRow({ tote, act }) {
  const owner = [tote.client_name, tote.project_name].filter(Boolean).join(' · ');
  return (
    <Link to={toteUrl(tote.id, act)}
      className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-3 active:bg-gray-800 hover:border-gray-700 min-w-0">
      <div className="flex-1 min-w-0">
        {tote.short_code && <div className="font-mono text-xs font-semibold text-red-300 truncate">{tote.short_code}</div>}
        <div className="text-[15px] font-semibold text-white truncate">{tote.name}</div>
        <div className="flex items-center gap-1 text-xs text-gray-400 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{tote.location_path?.length ? tote.location_path.join(' › ') : 'No location'}</span>
        </div>
        {owner && <div className="text-xs text-blue-300 truncate">{owner}</div>}
        {tote.matches?.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tote.matches.map((m) => (
              <span key={m} className="max-w-full truncate rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300">{m}</span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-gray-600 shrink-0" />
    </Link>
  );
}