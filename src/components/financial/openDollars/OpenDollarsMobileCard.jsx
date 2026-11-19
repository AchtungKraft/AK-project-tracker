import React from "react";
import { Button } from "@/components/ui/button";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";
import OpenDollarsFlags from "./OpenDollarsFlags";

const Cell = ({ label, value }) => (
  <div><p className="text-[11px] text-gray-500">{label}</p><p className="font-mono text-sm text-gray-200">{formatCurrencyUSD(value || 0)}</p></div>
);

export default function OpenDollarsMobileCard({ row, onCreateInvoice }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{row.project_name}</p>
          {row.client_name && <p className="text-xs text-gray-500 truncate">{row.client_name}</p>}
        </div>
        <p className="font-mono font-semibold text-emerald-300 shrink-0">{formatCurrencyUSD(row.total_open)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Parts" value={row.unbilled.parts} />
        <Cell label="Services" value={row.unbilled.services} />
        <Cell label="Labor" value={row.unbilled.labor} />
        <Cell label="On drafts" value={row.on_drafts} />
        <Cell label="Outstanding" value={row.outstanding} />
        <Cell label="Unbilled" value={row.unbilled.total} />
      </div>
      {row.flags.length > 0 && <OpenDollarsFlags flags={row.flags} expanded />}
      {row.unbilled.total > 0 && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => onCreateInvoice(row.project_id)}>Create invoice</Button>
      )}
    </div>
  );
}