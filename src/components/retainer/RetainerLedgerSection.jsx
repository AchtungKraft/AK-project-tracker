import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { formatCents } from "@/lib/retainerMoney";
import LedgerEntryModal from "@/components/retainer/LedgerEntryModal";

export default function RetainerLedgerSection({ retainer }) {
  const [mode, setMode] = useState(null);
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["retainerLedger", retainer.id],
    queryFn: async () => (await base44.entities.RetainerLedgerEntry.filter({ retainer_account_id: retainer.id }, { sort: "-recorded_at", limit: 100 })).items,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Funding transactions</h2>
        <div className="flex gap-2">
          <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setMode("deposit")}><Plus className="w-4 h-4 mr-1" />Record Deposit</Button>
          <Button size="sm" variant="outline" onClick={() => setMode("adjustment")}>Manual Correction</Button>
        </div>
      </div>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : entries.length === 0 ? (
        <p className="text-sm text-gray-400">No transactions yet.</p>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 divide-y divide-gray-800 text-sm">
          {entries.map((e) => (
            <div key={e.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-start">
              <span className="col-span-3 font-mono text-xs text-gray-300">{e.transaction_id}</span>
              <span className="col-span-2 capitalize text-gray-300">{e.entry_type}</span>
              <span className={`col-span-2 text-right font-medium ${e.amount_cents < 0 ? "text-red-400" : "text-emerald-400"}`}>{formatCents(e.amount_cents)}</span>
              <span className="col-span-5 text-gray-400">{e.reason}{e.external_reference ? ` · Ref ${e.external_reference}` : ""}<br /><span className="text-xs text-gray-500">{e.actor_email} · {new Date(e.recorded_at).toLocaleString()}</span></span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500">Entries are permanent. Fix mistakes with a manual correction.</p>
      {mode && <LedgerEntryModal retainer={retainer} entryType={mode} onClose={() => setMode(null)} />}
    </div>
  );
}