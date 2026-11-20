import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { depositAction, newKey, useDepositRefresh } from "./useProjectDeposits";

const OPTIONS = {
  exported: [["to_linked", "It is in QuickBooks, entered by hand or under another number"], ["not_in_quickbooks", "The export file was never imported into QuickBooks"]],
  linked: [["fix_reference", "Correct the QuickBooks reference"], ["not_in_quickbooks", "It is not in QuickBooks"]],
  reconciled: [["fix_reference", "Correct the QuickBooks reference"], ["not_in_quickbooks", "It was never entered in QuickBooks"]],
};

// target: { status, invoice_id?, ref?, title, confirm_value }
// Admin correction of a QuickBooks status. The original record stays in the audit trail; nothing is posted to QuickBooks.
export default function QbCorrectDialog({ target, onOpenChange, projectId }) {
  const refresh = useDepositRefresh(projectId);
  const [correction, setCorrection] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [attest, setAttest] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setCorrection(""); setReference(""); setReason(""); setAttest(false); setConfirm(""); setError(""); setKey(newKey()); }, [target]);
  const notIn = correction === "not_in_quickbooks";
  const ready = correction && reason.trim().length >= 10 && (notIn ? attest && confirm.trim() : reference.trim());

  const submit = async () => {
    setSaving(true); setError("");
    const res = await depositAction({ action: "qb_correct", project_id: projectId, status: target.status, invoice_id: target.invoice_id, ref: target.ref, correction, qb_reference: reference, reason, attest, confirm, idempotency_key: key });
    setSaving(false);
    if (res.success) { await refresh(); onOpenChange(false); } else { setError(res.error || "Could not save the correction."); setKey(newKey()); }
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct QuickBooks status: {target?.status}</DialogTitle>
          <DialogDescription>{target?.title}. The original entry is kept in the audit trail.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="space-y-1"><Label>What is actually true?</Label>
            <Select value={correction} onValueChange={setCorrection}><SelectTrigger><SelectValue placeholder="Choose a correction" /></SelectTrigger>
              <SelectContent>{(OPTIONS[target?.status] || []).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
          {correction && !notIn && <div className="space-y-1"><Label>Correct QuickBooks reference *</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>}
          {notIn && (
            <div className="space-y-2 rounded-md border border-amber-900/50 bg-amber-950/20 p-2 text-xs text-amber-200">
              <p>{target?.status === "reconciled" ? "This item goes back to needing a manual QuickBooks entry." : "This deposit invoice becomes eligible for QuickBooks export again."} If it is actually in QuickBooks, that would create a duplicate.</p>
              <label className="flex items-start gap-2"><Checkbox checked={attest} onCheckedChange={(v) => setAttest(v === true)} className="mt-0.5" /><span>I checked QuickBooks and this item is not there.</span></label>
              <div className="space-y-1"><Label className="text-amber-200">Type {target?.confirm_value} to confirm</Label><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            </div>
          )}
          <div className="space-y-1"><Label>Reason for the correction *</Label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 10 characters" /></div>
          {error && <p className="text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !ready} className="bg-red-600 hover:bg-red-700">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save correction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}