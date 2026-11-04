import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

const SECTIONS = [["summary", "Financial summary"], ["parts", "Parts"], ["services", "Services"], ["labor", "Labor"], ["invoices", "Invoice summary"]];
const MIME = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

export default function FinancialExportDialog({ projectId, format, onClose }) {
  const [type, setType] = useState("internal");
  const [sections, setSections] = useState(SECTIONS.map(([k]) => k));
  const [projected, setProjected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toggle = (k) => setSections((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const { data } = await base44.functions.invoke("exportProjectFinancialReport", { project_id: projectId, format, report_type: type, sections, include_projected: projected });
      if (!data?.success) throw new Error(data?.error || "Export failed");
      const bin = atob(data.file_base64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: MIME[format] }));
      const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Export failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Export {format === "pdf" ? "PDF" : "Excel"}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            {[["internal", "Internal Financial Report"], ["client", "Client Billing Detail"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setType(k)} className={`rounded-md border px-3 py-2 text-left ${type === k ? "border-red-500 bg-red-950/40 text-white" : "border-gray-700 text-gray-300"}`}>{l}</button>
            ))}
          </div>
          {type === "client" && <p className="text-xs text-gray-400">Excludes internal costs, margin and purchasing data. Marked "Billing Detail — Not an Invoice".</p>}
          <div className="space-y-2">
            {SECTIONS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-gray-200"><Checkbox checked={sections.includes(k)} onCheckedChange={() => toggle(k)} />{l}</label>
            ))}
            {type === "client" && <label className="flex items-center gap-2 text-gray-200"><Checkbox checked={projected} onCheckedChange={(v) => setProjected(!!v)} />Include projected future labor</label>}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || !sections.length} className="bg-red-600 hover:bg-red-700">
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{busy ? "Generating…" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}