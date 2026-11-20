import React from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const REASONS = {
  RESERVED_ON_DRAFTS: "Remaining amount is on draft invoices",
  NOTHING_LEFT_TO_SETTLE: "Already invoiced or settled",
  PART_CANCELLED: "Part cancelled",
  NOT_CLIENT_BILLABLE: "Not billed to client",
  MISSING_RETAIL: "No retail price",
  PART_NOT_FOUND: "Part not found",
  LEGACY_SETTLEMENT_REVIEW: "Older settlement needs review",
};

const q = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Cell({ label, value, className = "text-gray-300" }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className={`text-xs font-medium ${className}`}>{formatCurrencyUSD(value || 0)}</p>
    </div>
  );
}

export default function SettlementPartRow({ row }) {
  const name = row.part_name || (row.part_id ? `Part ${row.part_id.slice(-6)}` : row.commitment_id.slice(-8));
  const status = row.will_be_settled
    ? <Badge className="bg-emerald-600/20 text-emerald-400 text-[10px]">PAID</Badge>
    : row.credit_applied_new > 0
      ? <Badge className="bg-amber-600/20 text-amber-400 text-[10px]">Partial</Badge>
      : <Badge className="bg-gray-700/60 text-gray-400 text-[10px]">{REASONS[row.ineligible_reason] || "No credit left"}</Badge>;

  return (
    <div className="p-2 bg-gray-800/50 border border-gray-700 rounded">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-sm text-gray-200 font-medium truncate">{name}</p>
          {row.part_number && <p className="text-[11px] text-gray-500">{row.part_number}</p>}
        </div>
        {status}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Cell label="Part total" value={row.gross} />
        <Cell label="Invoiced" value={row.invoiced} />
        <Cell label="On drafts" value={row.on_drafts} className="text-amber-300" />
        <Cell label="Credit settled" value={row.credit_settled_existing} />
        <Cell label="Eligible" value={row.eligible} className="text-blue-300" />
        <Cell label="Applying now" value={row.credit_applied_new} className="text-emerald-400" />
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400 break-words">
        Qty: {q(row.required_total)} total · {q(row.invoiced_qty)} invoiced · {q(row.draft_qty)} on drafts · {q(row.credit_settled_qty)} settled with credit · <span className="text-blue-300">{q(row.eligible_qty)} eligible</span>
        {row.qty_settled_new > 0 && <> · <span className="text-emerald-400">{q(row.qty_settled_new)} settling now</span></>}
      </p>
    </div>
  );
}