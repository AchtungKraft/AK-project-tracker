import { Link } from "react-router-dom";
import { ArrowLeft, MapPin } from "lucide-react";

/** Compact tote identity: number (once), name, owner, location. */
export default function ToteHeader({ tote }) {
  const owner = [tote.client_name, tote.project_name].filter(Boolean).join(' · ');
  const nameIsCode = !tote.name || (tote.short_code && tote.name.includes(tote.short_code));
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <Link to="/storage" className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-300 active:bg-gray-800" aria-label="Back to Storage">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <div className="flex-1 min-w-0">
        {!nameIsCode && tote.short_code && <div className="font-mono text-[11px] font-semibold leading-tight text-red-300 truncate">{tote.short_code}</div>}
        <h1 className="text-base font-bold text-white leading-tight break-words">{nameIsCode ? (tote.name || tote.short_code) : tote.name}</h1>
        <div className="flex items-center gap-1 text-[11px] text-gray-400 min-w-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{tote.location_path?.length ? tote.location_path.join(' › ') : 'No location'}</span>
          {owner && <span className="truncate text-blue-300">· {owner}</span>}
        </div>
      </div>
    </div>
  );
}