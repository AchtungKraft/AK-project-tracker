import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import QbExportRow from "./QbExportRow";
import { qbExportAction, saveCsv } from "./qbExportApi";

// QuickBooks export history: the exact stored file can be downloaded again; regenerating builds a labeled copy
// from current records and never changes invoices, payments, balances or QuickBooks statuses.
export default function QuickBooksExportsPanel({ projectId }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["qbExports", projectId],
    queryFn: () => qbExportAction({ action: "list", project_id: projectId }),
    enabled: !!projectId,
  });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const run = async (id, kind, payload) => {
    setBusy({ id, kind }); setMessage(null);
    const r = await qbExportAction({ project_id: projectId, ...payload });
    setBusy(null);
    if (!r.success) { setMessage({ error: true, text: r.error || "Request failed" }); return; }
    saveCsv(r);
    const notes = [...(r.warnings || []), ...(kind === "regenerate" ? (r.identical_to_original ? ["Identical to the original."] : r.differences || []) : [])];
    if (r.integrity_ok === false) notes.unshift("Stored file no longer matches its recorded fingerprint.");
    setMessage({ error: r.integrity_ok === false, text: `${kind === "regenerate" ? `Regenerated as ${r.export_number}` : `Downloaded ${r.export_number}`}. ${notes.join(" ")}` });
    refetch();
  };

  const rows = [...(data?.exports || []), ...(data?.legacy_exports || [])];
  return (
    <div className="space-y-2 rounded-lg border border-gray-800 bg-black/40 p-3">
      <div className="flex items-center gap-2">
        <div className="mr-auto"><div className="text-sm font-semibold text-white">QuickBooks exports</div><div className="text-xs text-gray-500">Every export file, kept exactly as generated.</div></div>
        <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /></Button>
      </div>
      {message && <p className={`text-xs ${message.error ? "text-red-400" : "text-emerald-300"}`}>{message.text}</p>}
      {isLoading ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
        : !data?.success ? <p className="text-sm text-red-400">Could not load exports: {data?.error}</p>
        : !rows.length ? <p className="text-sm text-gray-500">No QuickBooks exports yet.</p>
        : <div className="max-h-80 divide-y divide-gray-800 overflow-y-auto">{rows.map((x) => {
            const id = x.export_number || `legacy:${x.exported_at}`;
            return <QbExportRow key={id} x={x} busy={busy?.id === id ? busy.kind : busy ? "other" : null}
              onDownload={() => run(id, "download", { action: "download", export_number: x.export_number })}
              onRegenerate={() => run(id, "regenerate", x.export_number ? { action: "regenerate", export_number: x.export_number } : { action: "regenerate", legacy_exported_at: x.exported_at })} />;
          })}</div>}
    </div>
  );
}