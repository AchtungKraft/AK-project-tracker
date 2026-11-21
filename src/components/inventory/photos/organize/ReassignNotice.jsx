import { AlertTriangle, Info } from "lucide-react";
import { emptiedBy } from "./selectionInfo";

/** Shows, before confirming, which existing items lose photos and which would be retired or blocked. */
export default function ReassignNotice({ info, targetId = null }) {
  const sources = info.groups.filter((g) => g.id !== targetId);
  if (!sources.length) return null;
  const emptied = emptiedBy(info, targetId);
  const blocked = emptied.filter((g) => g.identified);
  const retired = emptied.filter((g) => !g.identified);
  return (
    <div className="space-y-1.5 text-xs">
      <p className="flex gap-1.5 rounded border border-amber-800/60 bg-amber-950/30 p-2 text-amber-200">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>Photos will be moved out of: {sources.map((g) => `${g.name || 'item'} (${g.selected})`).join(', ')}.</span>
      </p>
      {retired.length > 0 && (
        <p className="rounded border border-gray-700 bg-gray-900/60 p-2 text-gray-300">
          {retired.map((g) => g.name).join(', ')} will have no photos left and will be retired. It stays in history and Undo can restore it.
        </p>
      )}
      {blocked.length > 0 && (
        <p className="flex gap-1.5 rounded border border-red-800/60 bg-red-950/30 p-2 text-red-200">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{blocked.map((g) => g.name).join(', ')} is identified as a part and must keep at least one photo. Deselect one of its photos, or remove the part match first.</span>
        </p>
      )}
    </div>
  );
}

export const isBlocked = (info, targetId = null) => emptiedBy(info, targetId).some((g) => g.identified);