import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import FinancialPartRows from "./FinancialPartRows";
import FinancialServiceRows from "./FinancialServiceRows";

function Section({ title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-3 text-sm text-white">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title} <span className="text-gray-500">({count})</span>
      </button>
      {open && <div className="px-3 pb-3 overflow-x-auto">{children}</div>}
    </div>
  );
}

export default function FinancialLineItems({ lines }) {
  return (
    <div className="space-y-2">
      <Section title="Part line items" count={lines.parts.length}><FinancialPartRows rows={lines.parts} /></Section>
      <Section title="Service line items" count={lines.services.length}><FinancialServiceRows rows={lines.services} /></Section>
    </div>
  );
}