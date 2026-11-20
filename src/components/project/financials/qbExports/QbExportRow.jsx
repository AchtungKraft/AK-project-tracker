import React from "react";
import { Download, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const when = (s) => (s ? String(s).replace("T", " ").slice(0, 16) : "—");

// One QuickBooks export: identity, what it contained, its activity, and download / regenerate.
export default function QbExportRow({ x, busy, onDownload, onRegenerate }) {
  const legacy = !x.export_number;
  const downloads = (x.events || []).filter((e) => e.event_type === "downloaded").length;
  return (
    <div className="flex flex-wrap items-start gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-white">
          <span className="font-mono">{legacy ? "Older export (no stored file)" : x.export_number}</span>
          {!legacy && <Badge className={x.kind === "regenerated" ? "bg-amber-900/50 text-amber-200" : "bg-emerald-900/50 text-emerald-200"}>{x.kind}</Badge>}
          {x.kind === "regenerated" && <span className="text-xs text-gray-500">from {x.regenerated_from || "older export"}{x.identical_to_original ? " · identical" : ""}</span>}
        </div>
        <div className="text-xs text-gray-500">
          {when(x.created_at || x.exported_at)} · {x.created_by_email || x.exported_by || "—"} · {legacy ? `${x.invoices.length} invoice(s): ${x.invoices.join(", ")}` : `${x.invoice_ids?.length || 0} invoice(s), ${x.line_count ?? 0} lines`}
          {downloads > 0 && ` · downloaded ${downloads}×`}
        </div>
        {x.differences?.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-amber-300">{x.differences.map((d) => <li key={d}>{d}</li>)}</ul>}
      </div>
      <div className="flex shrink-0 gap-1">
        {!legacy && <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={onDownload}>{busy === "download" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Download</Button>}
        {x.kind !== "regenerated" && <Button size="sm" variant="ghost" className="h-7 text-gray-400" disabled={busy} onClick={onRegenerate}>{busy === "regenerate" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Regenerate</Button>}
      </div>
    </div>
  );
}