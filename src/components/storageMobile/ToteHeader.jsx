import { Link } from "react-router-dom";
import { ArrowLeft, MapPin } from "lucide-react";

/** Compact tote identity: number, name, owner, location, photo count. */
export default function ToteHeader({ tote }) {
  const owner = [tote.client_name, tote.project_name].filter(Boolean).join(' · ');
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Link to="/storage" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-300 active:bg-gray-800" aria-label="Back to Storage">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {tote.short_code && <span className="font-mono text-xs font-semibold text-red-300 truncate">{tote.short_code}</span>}
          <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300">
            {tote.photo_count} {tote.photo_count === 1 ? 'photo' : 'photos'}
          </span>
        </div>
        <h1 className="text-lg font-bold text-white leading-tight break-words">{tote.name}</h1>
        {owner && <div className="text-xs text-blue-300 truncate">{owner}</div>}
        <div className="flex items-center gap-1 text-xs text-gray-400 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{tote.location_path?.length ? tote.location_path.join(' › ') : 'No location'}</span>
        </div>
      </div>
    </div>
  );
}