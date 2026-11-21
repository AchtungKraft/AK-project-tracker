import { cn } from "@/lib/utils";

export const LABEL_QUANTITIES = [3, 6, 9];

/** 3 / 6 / 9 label selector: one full three-up US Letter sheet per 3 labels. */
export default function LabelQuantitySelector({ value, onChange, disabled }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1.5">Number of Labels</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Number of labels">
        {LABEL_QUANTITIES.map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "rounded-lg border-2 py-3 text-center transition-colors",
              value === n ? "border-red-500 bg-red-950/40 text-white" : "border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500"
            )}
          >
            <span className="block text-lg font-bold leading-tight">{n} Labels</span>
            <span className="block text-[11px] text-gray-400">{n / 3} sheet{n > 3 ? 's' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}