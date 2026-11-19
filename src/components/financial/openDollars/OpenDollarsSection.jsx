import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import OpenDollarsSummary from "./OpenDollarsSummary";
import OpenDollarsTable from "./OpenDollarsTable";

// Open Dollars: unbilled parts/services/labor + outstanding invoices, per project. Read-only.
export default function OpenDollarsSection({ onCreateInvoice }) {
  const [showTable, setShowTable] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["openDollars"],
    queryFn: async () => (await base44.functions.invoke("getOpenDollarsOverview", {})).data,
    staleTime: 30000,
  });

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-gray-500 py-4"><Loader2 className="w-4 h-4 animate-spin" />Loading open dollars…</div>;
  if (error || !data?.success) return <div className="flex items-center gap-2 text-sm text-red-400 py-4"><AlertTriangle className="w-4 h-4" />Open dollars could not be loaded.</div>;

  const flagged = data.projects.filter((p) => p.flags.length).length;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">Open Dollars</h2>
      <OpenDollarsSummary totals={data.totals} />
      <button onClick={() => setShowTable((v) => !v)} className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white">
        {showTable ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        By project ({data.projects.length}){flagged > 0 && <span className="text-amber-400">, {flagged} need review</span>}
      </button>
      {showTable && <OpenDollarsTable rows={data.projects} onCreateInvoice={onCreateInvoice} />}
    </section>
  );
}