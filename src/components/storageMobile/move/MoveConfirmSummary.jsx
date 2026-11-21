import { ArrowDown, MapPin } from "lucide-react";

const ToteBox = ({ tote, tone }) => (
  <div className={`rounded-lg border px-3 py-2 min-w-0 ${tone}`}>
    {tote.short_code && <div className="font-mono text-xs font-semibold text-red-300 truncate">{tote.short_code}</div>}
    <div className="text-sm font-semibold text-white truncate">{tote.name}</div>
    <div className="flex items-center gap-1 text-[11px] text-gray-400 truncate"><MapPin className="w-3 h-3 shrink-0" />{tote.location_path?.join(' › ') || 'No location'}</div>
  </div>
);

/** What moves, from where, to where. Shown before the explicit confirmation. */
export default function MoveConfirmSummary({ source, destination, description }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-200">Move <span className="font-semibold text-white">{description}</span></p>
      <ToteBox tote={source} tone="border-gray-800 bg-gray-900/40" />
      <ArrowDown className="w-4 h-4 mx-auto text-gray-500" />
      <ToteBox tote={destination} tone="border-red-800/70 bg-red-950/20" />
      <p className="text-[11px] text-gray-400">Physical move: put these contents into the destination tote now. Both totes stay where they are. Names, quantities, part matches and photos are kept.</p>
    </div>
  );
}