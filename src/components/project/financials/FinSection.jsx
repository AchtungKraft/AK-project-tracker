import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// Expandable detail section used across the three financial areas. Controlled when `open` is passed.
export default function FinSection({ title, sub, defaultOpen = false, open: controlled, onOpenChange, children }) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const setOpen = onOpenChange ?? setOwn;
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <section className="rounded-lg border border-gray-800 bg-black/30">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-900/40 rounded-lg">
        <Icon className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-white">{title}</span>
          {sub && <span className="block text-xs text-gray-500">{sub}</span>}
        </span>
      </button>
      {open && <div className="px-3 pb-3 space-y-3 min-w-0">{children}</div>}
    </section>
  );
}