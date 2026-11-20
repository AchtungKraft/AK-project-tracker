import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/project/financials/finFormat";
import { depositAction, newKey, useDepositRefresh } from "./useProjectDeposits";

// Adds a corrective entry; the original entry is kept.
export default function ReverseDepositDialog({ entry, onOpenChange, projectId }) {
  const refresh = useDepositRefresh(projectId);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (entry) { setReason(""); setError(""); setKey(newKey()); } }, [entry]);

  const submit = async () => {
    setSaving(true); setError("");
    const r = await depositAction({ action: "reverse", application_id: entry.application_id, reason, idempotency_key: key });
    setSaving(false);
    if (r.success) { await refresh(); onOpenChange(false); } else setError(r.error || "Could not reverse.");
  };

  const isApply = entry?.kind === "apply";
  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isApply ? "Reverse deposit application" : "Reverse refund"}</DialogTitle>
          <DialogDescription>{isApply ? `Returns ${money(Math.abs(entry?.amount || 0))} to the original deposit and adds it back to invoice ${entry?.invoice}.` : `Restores ${money(Math.abs(entry?.amount || 0))} of unused deposit credit.`} The original entry stays in the history.</DialogDescription></DialogHeader>
        <div className="space-y-1 py-2"><Label>Reason *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being reversed?" /></div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || reason.trim().length < 3} className="bg-red-600 hover:bg-red-700">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Reverse</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}