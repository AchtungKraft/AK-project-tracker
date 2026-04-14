import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { supplyKeys } from "@/components/supply/useProjectSupplyView";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Truck, ShieldAlert, Calculator } from "lucide-react";
import { toast } from "sonner";

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * POFinancialSummary — Financial visibility strip for PO Receiving Detail.
 * Shows parts total, editable freight + tariff, and computed landed total.
 * Saves on blur via UPDATE_PO_COSTS action.
 */
export default function POFinancialSummary({ po, refetch }) {
  const queryClient = useQueryClient();
  const partsTotal = po?.total_cost || 0;

  const [freight, setFreight] = useState(String(po?.freight_cost || 0));
  const [tariff, setTariff] = useState(String(po?.tariff_cost || 0));
  const [saving, setSaving] = useState(false);

  // Sync from server when PO data refreshes
  useEffect(() => {
    setFreight(String(po?.freight_cost || 0));
    setTariff(String(po?.tariff_cost || 0));
  }, [po?.freight_cost, po?.tariff_cost]);

  const freightNum = Number(freight) || 0;
  const tariffNum = Number(tariff) || 0;
  const landedTotal = partsTotal + freightNum + tariffNum;

  const freightValid = freight !== "" && Number.isFinite(Number(freight)) && Number(freight) >= 0;
  const tariffValid = tariff !== "" && Number.isFinite(Number(tariff)) && Number(tariff) >= 0;

  const persist = useCallback(async (field, value) => {
    const numVal = Number(value);
    if (!Number.isFinite(numVal) || numVal < 0) return;
    // Skip if unchanged
    const current = field === "freight_cost" ? (po?.freight_cost || 0) : (po?.tariff_cost || 0);
    if (Math.abs(numVal - current) < 0.001) return;

    setSaving(true);
    try {
      const response = await base44.functions.invoke("executeSupplyAction", {
        action_type: "UPDATE_PO_COSTS",
        commitment_ids: [],
        payload: {
          order_id: po.order_id,
          [field]: numVal,
        },
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
  }, [po?.order_id, po?.freight_cost, po?.tariff_cost, queryClient, refetch]);

  return (
    <Card className="bg-gray-900/50 border-gray-700">
      <CardContent className="p-4">
        <div className="grid grid-cols-4 gap-4 items-end">
          {/* Parts Total */}
          <div>
            <Label className="text-gray-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Parts Total
            </Label>
            <div className="text-lg font-bold text-white font-mono mt-1">
              ${fmt(partsTotal)}
            </div>
          </div>

          {/* Freight — editable */}
          <div>
            <Label className="text-gray-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
              <Truck className="w-3 h-3" /> Freight
            </Label>
            <div className="relative mt-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={freight}
                onChange={(e) => setFreight(e.target.value)}
                onBlur={() => persist("freight_cost", freight)}
                className={`pl-6 h-9 bg-gray-800 border-gray-600 font-mono ${!freightValid ? "border-red-500" : ""}`}
                disabled={saving}
              />
            </div>
            {!freightValid && <p className="text-red-400 text-[10px] mt-0.5">Must be ≥ 0</p>}
          </div>

          {/* Tariff — editable */}
          <div>
            <Label className="text-gray-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Tariff / Tax
            </Label>
            <div className="relative mt-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tariff}
                onChange={(e) => setTariff(e.target.value)}
                onBlur={() => persist("tariff_cost", tariff)}
                className={`pl-6 h-9 bg-gray-800 border-gray-600 font-mono ${!tariffValid ? "border-red-500" : ""}`}
                disabled={saving}
              />
            </div>
            {!tariffValid && <p className="text-red-400 text-[10px] mt-0.5">Must be ≥ 0</p>}
          </div>

          {/* Landed Total */}
          <div>
            <Label className="text-gray-500 text-[10px] uppercase tracking-wider flex items-center gap-1">
              <Calculator className="w-3 h-3" /> Landed Total
            </Label>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
              ${fmt(landedTotal)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}