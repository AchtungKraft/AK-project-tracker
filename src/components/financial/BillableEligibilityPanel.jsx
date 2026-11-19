import React, { useState } from "react";
import { ChevronDown, ChevronRight, Lock, Ban } from "lucide-react";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

// Read-only eligibility breakdown for the invoice builder: what is already on active drafts and what is excluded.
// Nothing here is selectable; the server enforces the same rules on create and send.
export default function BillableEligibilityPanel({ summary, allocated = [], excluded = [] }) {
  const [open, setOpen] = useState(null);
  if (!summary) return null;
  const row = (label, value, cls = "text-white") => (
    <div className="flex justify-between"><span className="text-gray-400">{label}</span><span className={`font-mono ${cls}`}>{value}</span></div>
  );
  const toggle = (k) => setOpen(open === k ? null : k);
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2 text-xs">
      {row("Available to invoice now", formatCurrencyUSD(summary.available_total || 0), "text-green-400")}
      {row("Already on active drafts", formatCurrencyUSD(summary.allocated_to_drafts_total || 0), "text-amber-400")}
      {row("Excluded or blocked", formatCurrencyUSD(summary.excluded_total || 0), "text-gray-300")}
      <div className="border-t border-gray-800 pt-2">{row("Total unbilled", formatCurrencyUSD(summary.total_unbilled || 0))}</div>
      {allocated.length > 0 && (
        <Section icon={Lock} title={`On active drafts (${allocated.length})`} isOpen={open === "a"} onToggle={() => toggle("a")}>
          {allocated.map((i) => (
            <Line key={`a-${i.source_id}`} label={i.task_name || i.description} sub={`${i.qty_allocated}${i.type === "labor" ? "h" : ""} on draft`} amount={formatCurrencyUSD(i.allocated_amount)} />
          ))}
        </Section>
      )}
      {excluded.length > 0 && (
        <Section icon={Ban} title={`Excluded (${excluded.length})`} isOpen={open === "e"} onToggle={() => toggle("e")}>
          {excluded.map((i, idx) => (
            <Line key={`e-${idx}`} label={i.description} sub={i.message} amount={i.amount != null ? formatCurrencyUSD(i.amount) : `${i.hours}h`} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, isOpen, onToggle, children }) {
  return (
    <div>
      <button type="button" onClick={onToggle} className="flex items-center gap-1.5 text-gray-300 hover:text-white">
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Icon className="w-3.5 h-3.5" />{title}
      </button>
      {isOpen && <div className="mt-1 pl-5 space-y-1 max-h-40 overflow-y-auto">{children}</div>}
    </div>
  );
}

function Line({ label, sub, amount }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><p className="text-gray-200 truncate">{label}</p><p className="text-gray-500 truncate">{sub}</p></div>
      <span className="font-mono text-gray-300 shrink-0">{amount}</span>
    </div>
  );
}