import React, { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CollapsibleSection({ title, icon: Icon, defaultOpen = false, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-500" />
          : <ChevronRight className="w-4 h-4 text-gray-500" />
        }
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}
        <span className="text-sm font-medium text-gray-300">{title}</span>
        {badge && <span className="ml-auto text-xs text-gray-500">{badge}</span>}
      </button>
      {open && (
        <div className={cn("pb-2", Icon ? "pl-6" : "pl-6")}>
          {children}
        </div>
      )}
    </div>
  );
}