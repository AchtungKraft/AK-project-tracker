import { cn } from "@/lib/utils";

const MODES = [{ key: 'contents', label: 'Contents' }, { key: 'photos', label: 'Photos' }];

/** Contents (what is physically inside) vs Photos (every photo, for organizing). */
export default function ToteModeTabs({ mode, onMode }) {
  return (
    <div className="flex rounded-lg border border-gray-800 bg-gray-900/60 p-0.5" role="tablist" aria-label="Tote view">
      {MODES.map((m) => (
        <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} onClick={() => onMode(m.key)}
          className={cn("flex-1 h-8 rounded-md text-xs font-semibold",
            mode === m.key ? "bg-gray-700 text-white" : "text-gray-400")}>
          {m.label}
        </button>
      ))}
    </div>
  );
}