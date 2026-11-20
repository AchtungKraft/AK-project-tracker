import React from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

const Row = ({ label, hint, available, value, max, onChange, tone }) => (
  <div className="flex flex-wrap items-center gap-2 py-1">
    <div className="min-w-[9rem] flex-1">
      <div className={`text-xs ${tone}`}>{label}</div>
      <div className="text-[11px] text-gray-500">{formatCurrencyUSD(available)} available{hint ? ` · ${hint}` : ""}</div>
    </div>
    <div className="flex items-center gap-1">
      <span className={`text-sm ${tone}`}>$</span>
      <Input type="number" min={0} max={max} step="0.01" placeholder="0.00" value={value} disabled={available <= 0}
        onChange={(e) => onChange(e.target.value)} className="h-7 w-28 bg-gray-900 font-mono text-sm" />
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-400" disabled={max <= 0} onClick={() => onChange(max.toFixed(2))}>Max</Button>
    </div>
  </div>
);

// Explicit credit choice for a new invoice: deposit credit and general project credit are chosen separately, default 0.
// Availability already excludes credit reserved by other drafts. Nothing is deducted until the invoice is sent.
export default function InvoiceCreditSelector({ availability, loading, deposit, general, onDeposit, onGeneral, subtotal, error }) {
  if (loading) return <div className="flex items-center gap-2 py-1 text-xs text-gray-500"><Loader2 className="h-3 w-3 animate-spin" />Checking available credit…</div>;
  if (!availability) return null;
  const { available_deposit: dep = 0, available_general: gen = 0 } = availability;
  if (dep <= 0 && gen <= 0) return <p className="py-1 text-xs text-gray-500">No deposit or general project credit is available to apply.</p>;
  const d = parseFloat(deposit) || 0; const g = parseFloat(general) || 0;
  return (
    <div className="space-y-0.5 border-y border-gray-700/50 py-1">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">Credit to apply (optional)</div>
      <Row label="Deposit credit" hint="client advance payments" tone="text-amber-300" available={dep} value={deposit} onChange={onDeposit} max={Math.max(0, Math.min(dep, subtotal - g))} />
      <Row label="General project credit" hint="part removals, adjustments" tone="text-sky-300" available={gen} value={general} onChange={onGeneral} max={Math.max(0, Math.min(gen, subtotal - d))} />
      {error && <p className="flex items-center gap-1 text-xs text-red-400"><AlertTriangle className="h-3 w-3" />{error}</p>}
    </div>
  );
}