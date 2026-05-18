import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Truck, ShieldAlert, Calculator, Package, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrencyUSD } from "@/components/supply/pricingHelpers";

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CostInput({ label, icon: Icon, value, onChange, onBlur, saving }) {
  const num = Number(value);
  const valid = value !== "" && Number.isFinite(num) && num >= 0;
  return (
    <div>
      <Label className="text-gray-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </Label>
      <div className="relative mt-1">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={cn("pl-6 h-9 bg-gray-800 border-gray-600 font-mono", !valid && "border-red-500")}
          disabled={saving}
        />
      </div>
    </div>
  );
}

/**
 * POFinancialSummary — Financial visibility strip for PO Receiving Detail.
 * Shows parts total, editable freight/tax/tariff/misc, and computed landed total.
 * Saves on blur via UPDATE_PO_COSTS action which auto-triggers allocation.
 */
export default function POFinancialSummary({ po, refetch }) {
  const queryClient = useQueryClient();
  const partsTotal = po?.total_cost || 0;

  const [freight, setFreight] = useState(String(po?.freight_cost || 0));
  const [tariff, setTariff] = useState(String(po?.tariff_cost || 0));
  const [tax, setTax] = useState(String(po?.tax || 0));
  const [misc, setMisc] = useState(String(po?.misc_cost || 0));
  const [saving, setSaving] = useState(false);
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => {
    setFreight(String(po?.freight_cost || 0));
    setTariff(String(po?.tariff_cost || 0));
    setTax(String(po?.tax || 0));
    setMisc(String(po?.misc_cost || 0));
  }, [po?.freight_cost, po?.tariff_cost, po?.tax, po?.misc_cost]);

  const freightNum = Number(freight) || 0;
  const tariffNum = Number(tariff) || 0;
  const taxNum = Number(tax) || 0;
  const miscNum = Number(misc) || 0;
  const extrasTotal = freightNum + tariffNum + taxNum + miscNum;
  const landedTotal = partsTotal + extrasTotal;

  const persist = useCallback(async (field, value) => {
    const numVal = Number(value);
    if (!Number.isFinite(numVal) || numVal < 0) return;
    const currentMap = {
      freight_cost: po?.freight_cost || 0,
      tariff_cost: po?.tariff_cost || 0,
      tax: po?.tax || 0,
      misc_cost: po?.misc_cost || 0,
    };
    if (Math.abs(numVal - (currentMap[field] || 0)) < 0.001) return;

    setSaving(true);
    try {
      const response = await base44.functions.invoke("executeSupplyAction", {
        action_type: "UPDATE_PO_COSTS",
        commitment_ids: [],
        payload: { order_id: po.order_id, [field]: numVal },
        dry_run: false,
      });
      if (response.data?.error) throw new Error(response.data.error);
      queryClient.invalidateQueries({ queryKey: ["poReceivingView", po.order_id], exact: false });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      if (refetch) refetch();
    } catch (err) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  }, [po?.order_id, po?.freight_cost, po?.tariff_cost, po?.tax, po?.misc_cost, queryClient, refetch]);

  // Per-line landed cost diagnostics (from PO lines data)
  const lineDiagnostics = (po?.lines || []).map(line => {
    const baseCost = (line.unit_cost || 0) * (line.qty_ordered || 0);
    const allocFreight = line.allocated_freight || 0;
    const allocTariff = line.allocated_tariff || 0;
    const allocTax = line.allocated_tax || 0;
    const allocMisc = line.allocated_misc || 0;
    const totalAlloc = allocFreight + allocTariff + allocTax + allocMisc;
    return {
      part_name: line.part_name || 'Unknown',
      qty: line.qty_ordered || 0,
      base_unit: line.unit_cost || 0,
      base_total: baseCost,
      alloc_freight: allocFreight,
      alloc_tariff: allocTariff,
      alloc_tax: allocTax,
      alloc_misc: allocMisc,
      total_alloc: totalAlloc,
      effective_unit: line.effective_unit_cost || line.unit_cost || 0,
      landed_total: baseCost + totalAlloc,
    };
  });

  const hasAllocations = lineDiagnostics.some(d => d.total_alloc > 0);

  return (
    <div className="space-y-2">
      <Card className="bg-gray-900/50 border-gray-700">
        <CardContent className="p-4">
          {/* Top row: Parts Total + Landed Total */}
          <div className="grid grid-cols-6 gap-3 items-end">
            <div>
              <Label className="text-gray-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Parts Total
              </Label>
              <div className="text-lg font-bold text-white font-mono mt-1">
                ${fmt(partsTotal)}
              </div>
            </div>

            <CostInput
              label="Shipping"
              icon={Truck}
              value={freight}
              onChange={setFreight}
              onBlur={() => persist("freight_cost", freight)}
              saving={saving}
            />
            <CostInput
              label="Tax"
              icon={ShieldAlert}
              value={tax}
              onChange={setTax}
              onBlur={() => persist("tax", tax)}
              saving={saving}
            />
            <CostInput
              label="Tariff / Duty"
              icon={ShieldAlert}
              value={tariff}
              onChange={setTariff}
              onBlur={() => persist("tariff_cost", tariff)}
              saving={saving}
            />
            <CostInput
              label="Handling / Misc"
              icon={Package}
              value={misc}
              onChange={setMisc}
              onBlur={() => persist("misc_cost", misc)}
              saving={saving}
            />

            <div>
              <Label className="text-gray-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Calculator className="w-3 h-3" /> Landed Total
              </Label>
              <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                ${fmt(landedTotal)}
              </div>
              {extrasTotal > 0 && (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  +${fmt(extrasTotal)} absorbed into part cost
                </p>
              )}
            </div>
          </div>

          {/* Diagnostics toggle */}
          {hasAllocations && (
            <button
              onClick={() => setShowDiag(!showDiag)}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 mt-3 transition-colors"
            >
              {showDiag ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Per-Line Landed Cost Breakdown
            </button>
          )}
        </CardContent>
      </Card>

      {/* Diagnostics Panel — Per-line landed cost breakdown */}
      {showDiag && hasAllocations && (
        <Card className="bg-gray-950/60 border-gray-800">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <Calculator className="w-3 h-3" /> Landed Cost Allocation Detail
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-1 pr-3">Part</th>
                    <th className="text-right py-1 px-2">Qty</th>
                    <th className="text-right py-1 px-2">Base Cost</th>
                    <th className="text-right py-1 px-2">+Ship</th>
                    <th className="text-right py-1 px-2">+Tax</th>
                    <th className="text-right py-1 px-2">+Tariff</th>
                    <th className="text-right py-1 px-2">+Misc</th>
                    <th className="text-right py-1 px-2 text-emerald-400">True Cost/ea</th>
                    <th className="text-right py-1 pl-2 text-emerald-400">Landed Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineDiagnostics.map((d, idx) => (
                    <tr key={idx} className="border-b border-gray-800/50 text-gray-300">
                      <td className="py-1.5 pr-3 text-white max-w-[200px] truncate">{d.part_name}</td>
                      <td className="text-right py-1.5 px-2">{d.qty}</td>
                      <td className="text-right py-1.5 px-2 font-mono">{formatCurrencyUSD(d.base_unit)}</td>
                      <td className="text-right py-1.5 px-2 font-mono text-blue-400">{d.alloc_freight > 0 ? formatCurrencyUSD(d.alloc_freight) : '—'}</td>
                      <td className="text-right py-1.5 px-2 font-mono text-amber-400">{d.alloc_tax > 0 ? formatCurrencyUSD(d.alloc_tax) : '—'}</td>
                      <td className="text-right py-1.5 px-2 font-mono text-purple-400">{d.alloc_tariff > 0 ? formatCurrencyUSD(d.alloc_tariff) : '—'}</td>
                      <td className="text-right py-1.5 px-2 font-mono text-orange-400">{d.alloc_misc > 0 ? formatCurrencyUSD(d.alloc_misc) : '—'}</td>
                      <td className="text-right py-1.5 px-2 font-mono font-bold text-emerald-400">{formatCurrencyUSD(d.effective_unit)}</td>
                      <td className="text-right py-1.5 pl-2 font-mono font-bold text-emerald-300">{formatCurrencyUSD(d.landed_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-700 text-gray-200 font-medium">
                    <td className="py-1.5 pr-3">Total</td>
                    <td className="text-right py-1.5 px-2">{lineDiagnostics.reduce((s, d) => s + d.qty, 0)}</td>
                    <td className="text-right py-1.5 px-2 font-mono">{formatCurrencyUSD(lineDiagnostics.reduce((s, d) => s + d.base_total, 0))}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-blue-400">{formatCurrencyUSD(lineDiagnostics.reduce((s, d) => s + d.alloc_freight, 0))}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-amber-400">{formatCurrencyUSD(lineDiagnostics.reduce((s, d) => s + d.alloc_tax, 0))}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-purple-400">{formatCurrencyUSD(lineDiagnostics.reduce((s, d) => s + d.alloc_tariff, 0))}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-orange-400">{formatCurrencyUSD(lineDiagnostics.reduce((s, d) => s + d.alloc_misc, 0))}</td>
                    <td></td>
                    <td className="text-right py-1.5 pl-2 font-mono font-bold text-emerald-400">{formatCurrencyUSD(lineDiagnostics.reduce((s, d) => s + d.landed_total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[9px] text-gray-600 mt-2">
              PO shared costs are proportionally allocated to each line by base cost weight. True cost per unit includes all allocations. This cost flows to commitment → project cost → profitability. Client invoices are unaffected.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}