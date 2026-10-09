import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { formatCents } from "@/lib/retainerMoney";
import RetainerRateForm from "@/components/retainer/RetainerRateForm";

export default function RetainerRatesSection({ retainer }) {
  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["retainerRates", retainer.id],
    queryFn: async () => (await base44.entities.RetainerRate.filter({ retainer_account_id: retainer.id, is_active: true }, { sort: "labor_group_name_snapshot", limit: 100 })).items,
  });

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-white">Negotiated rates</h2>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : rates.length === 0 ? (
        <p className="text-sm text-gray-400">No negotiated rates yet.</p>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 divide-y divide-gray-800 text-sm">
          {rates.map((r) => (
            <div key={r.id} className="grid grid-cols-4 gap-2 px-4 py-2 items-center">
              <span className="text-white">{r.labor_group_name_snapshot}</span>
              <span className="text-gray-400">Standard {formatCents(r.standard_rate_cents_snapshot)}/hr</span>
              <span className="text-white">Negotiated {formatCents(r.negotiated_rate_cents)}/hr</span>
              <span className="text-gray-400 text-right">{(r.discount_bps_snapshot / 100).toFixed(2)}% off · {r.set_by_email}</span>
            </div>
          ))}
        </div>
      )}
      <RetainerRateForm retainer={retainer} />
    </div>
  );
}