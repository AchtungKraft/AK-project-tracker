import React from "react";

const LABEL = {
  missing_cost: "No cost", missing_retail: "No price", stale_stored_total: "Stale stored total",
  duplicate_draft: "Duplicate draft", client_supplied: "Client supplied",
  billed_without_final_invoice: "Billed, no invoice",
};

export default function FlagChips({ flags }) {
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded ${f === "client_supplied" ? "bg-gray-700 text-gray-300" : "bg-amber-900/50 text-amber-300"}`}>
          {LABEL[f] || f}
        </span>
      ))}
    </div>
  );
}