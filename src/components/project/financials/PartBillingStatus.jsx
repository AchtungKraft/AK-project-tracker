import React from "react";
import { money } from "./finFormat";

// Display-only billing status from existing quantities; no calculation changes.
export default function PartBillingStatus({ r }) {
  const avail = Math.max(0, r.available_qty - r.allocated_qty);
  const priceDiff = r.allocated_qty > 0 && Math.abs(r.draft_amount - r.allocated_current_value) > 0.01;
  const parts = [];
  if (r.invoiced_qty > 0) parts.push(<span key="f" className="text-green-400">{r.invoiced_qty} finalized</span>);
  if (r.allocated_qty > 0) parts.push(<span key="d" className="text-blue-300">{r.allocated_qty} on draft ({money(r.draft_amount)})</span>);
  if (avail > 0) parts.push(<span key="a" className="text-gray-300">{avail} available</span>);
  if (!parts.length) parts.push(<span key="n" className="text-gray-500">Nothing to bill</span>);
  return (
    <div className="text-[11px] leading-tight">
      {parts.map((p, i) => <div key={i}>{p}</div>)}
      {priceDiff && <div className="text-amber-400">Draft price differs from current</div>}
    </div>
  );
}