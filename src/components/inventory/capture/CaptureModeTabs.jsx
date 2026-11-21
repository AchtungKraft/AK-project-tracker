import { Images, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  { key: 'quick', label: 'Quick Photos', hint: 'Unsorted, no details', icon: Images },
  { key: 'item', label: 'New Item', hint: 'Photos of one item', icon: Package },
];

/** Large two-way switch between Quick Photos and New Item capture. */
export default function CaptureModeTabs({ mode, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-900 p-1" role="tablist">
      {MODES.map(({ key, label, hint, icon: Icon }) => (
        <button key={key} type="button" role="tab" aria-selected={mode === key} disabled={disabled && mode !== key}
          onClick={() => onChange(key)}
          className={cn('flex min-h-[52px] flex-col items-center justify-center rounded-lg px-2 py-1.5 transition-colors',
            mode === key ? 'bg-red-600 text-white' : 'text-gray-300 active:bg-gray-800')}>
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4" />{label}</span>
          <span className={cn('text-[11px]', mode === key ? 'text-red-100' : 'text-gray-500')}>{hint}</span>
        </button>
      ))}
    </div>
  );
}