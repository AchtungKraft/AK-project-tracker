import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import FinancialPartRows from "./FinancialPartRows";
import FinancialServiceRows from "./FinancialServiceRows";
import DraftReconciliationNote from "./DraftReconciliationNote";
import StaleTotalsDrilldown from "./StaleTotalsDrilldown";
import FinancialLaborRows from "./FinancialLaborRows";

function Section({ title, count, note, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 p-3 text-sm text-white">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title} <span className="text-gray-500">({count})</span>
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{note}<div className="overflow-x-auto">{children}</div></div>}
    </div>
  );
}

export default function FinancialLineItems({ lines, laborBilling }) {
  const stale = lines.parts.filter((p) => p.stale_detail);
  const partNote = stale.length > 0 && (
    <div className="text-[11px] text-gray-400">
      {stale.length} stored part total{stale.length > 1 ? "s are" : " is"} out of date (informational; calculations use current price × quantity).
      <div className="-ml-6"><StaleTotalsDrilldown parts={lines.parts} /></div>
    </div>
  );
  return (
    <div className="space-y-2">
      <DraftReconciliationNote lines={lines} />
      <Section title="Part line items" count={lines.parts.length} note={partNote}><FinancialPartRows rows={lines.parts} /></Section>
      <Section title="Service line items" count={lines.services.length}><FinancialServiceRows rows={lines.services} /></Section>
      {laborBilling && (
        <Section title="Labor line items" count={(laborBilling.tasks || []).filter((t) => t.logged > 0 || t.remaining_hours > 0).length}
          note={<p className="text-[11px] text-gray-500">Estimated, not invoiced. Labor included in a service is not counted again. Internal labor cost is not configured.</p>}>
          <FinancialLaborRows lb={laborBilling} />
        </Section>
      )}
    </div>
  );
}