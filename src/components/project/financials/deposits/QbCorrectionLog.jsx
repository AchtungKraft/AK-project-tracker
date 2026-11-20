import React from "react";

const CHANGE = { to_linked: "exported → linked", fix_reference: "reference corrected", not_in_quickbooks: "marked not in QuickBooks" };
const prevText = (d) => {
  const p = d?.previous || {};
  if (d?.status === "reconciled") return `was reconciled as ${p.reference || "—"} by ${p.by || "—"}`;
  return `was ${p.qb_export_status}${p.qb_export_id ? ` in ${p.qb_export_id}` : ""}${p.qb_link_reference ? ` (ref ${p.qb_link_reference})` : ""}`;
};

// Immutable audit of QuickBooks status corrections, each with the original values it replaced.
export default function QbCorrectionLog({ items }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1">
      <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">QuickBooks status corrections</div>
      <div className="divide-y divide-gray-800 text-xs">
        {items.map((c) => (
          <div key={c.id} className="py-1.5">
            <div className="text-gray-200">{c.item}: {c.detail?.status} {CHANGE[c.detail?.correction] || c.detail?.correction}{c.detail?.next?.reference || c.detail?.next?.qb_link_reference ? ` → ${c.detail.next.reference || c.detail.next.qb_link_reference}` : ""}</div>
            <div className="text-gray-500">{String(c.at).slice(0, 10)} · {c.actor} · {prevText(c.detail)} · “{c.reason}”</div>
          </div>
        ))}
      </div>
    </div>
  );
}