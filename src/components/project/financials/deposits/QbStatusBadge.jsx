import React from "react";

const STYLE = {
  in_quickbooks: ["Existing in QuickBooks", "border-sky-800 text-sky-300"],
  needs_manual_entry: ["Needs manual QuickBooks entry", "border-amber-800 text-amber-300"],
  reconciled: ["Reconciled", "border-emerald-800 text-emerald-300"],
};

// Every item here is recorded in AK PROJECTS. This badge shows only what an admin has confirmed about QuickBooks;
// nothing is ever posted to QuickBooks automatically.
export default function QbStatusBadge({ status, reference }) {
  const [label, cls] = STYLE[status] || ["Recorded in AK PROJECTS", "border-gray-700 text-gray-400"];
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] leading-none ${cls}`} title={reference ? `QuickBooks ref ${reference}` : undefined}>
      {label}{status === "reconciled" && reference ? ` · ${reference}` : ""}
    </span>
  );
}