import React from "react";
import { Button } from "@/components/ui/button";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import OpenDollarsFlags from "./OpenDollarsFlags";

const Cell = ({ label, value }) => (
  <div className="min-w-0"><p className="text-[11px] text-gray-500 truncate">{label}</p><p className="font-mono text-sm text-gray-200">{formatCurrencyUSD(value || 0)}</p></div>
);

export default function OpenDollarsMobileCard({ row, onCreateInvoice }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{row.project_name}</p>
          {row.client_name && <p className="text-xs text-gray-500 truncate">{row.client_name}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono font-semibold text-emerald-300">{formatCurrencyUSD(row.total_open)}</p>
          <p className="text-[11px] text-gray-500">expected {formatCurrencyUSD(row.expected_total)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Received parts" value={row.unbilled.parts_received} />
        <Cell label="Unreceived parts" value={row.unbilled.parts_unreceived} />
        <Cell label="Services" value={row.unbilled.services} />
        <Cell label="Earned labor" value={row.unbilled.labor} />
        <Cell label="Unbilled" value={row.unbilled.total} />
        <Cell label="Outstanding" value={row.outstanding} />
        <Cell label="On drafts" value={row.on_drafts} />
        <Cell label="Projected" value={row.projected.additional} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <OpenDollarsFlags flags={row.flags} />
        {row.unbilled.total > 0 && <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => onCreateInvoice(row.project_id)}>Invoice</Button>}
      </div>
    </div>
  );
}