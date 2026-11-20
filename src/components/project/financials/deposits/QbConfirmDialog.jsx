import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { depositAction, useDepositRefresh } from "./useProjectDeposits";

// target: { mode: 'reconcile', ref, title } | { mode: 'link', invoice_id, title }
// Records an admin confirmation only. Nothing is sent to or changed in QuickBooks.
export default function QbConfirmDialog({ target, onOpenChange, projectId }) {
  const refresh = useDepositRefresh(projectId);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setReference(""); setNote(""); setError(""); }, [target]);
  const link = target?.mode === "link";

  const submit = async () => {
    setSaving(true); setError("");
    const res = await depositAction(link
      ? { action: "qb_link", invoice_id: target.invoice_id, qb_reference: reference }
      : { action: "qb_reconcile", project_id: projectId, ref: target.ref, qb_reference: reference, note });
    setSaving(false);
    if (res.success) { await refresh(); onOpenChange(false); } else setError(res.error || "Could not save.");
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{link ? "Already in QuickBooks" : "Mark as entered in QuickBooks"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p className="text-gray-400">{target?.title}</p>
          <p className="text-xs text-gray-500">{link
            ? "Confirms this deposit invoice already exists in QuickBooks. It will be left out of future QuickBooks exports so it can't be created twice."
            : "Confirms you entered this in QuickBooks yourself. AK PROJECTS does not post anything to QuickBooks."}</p>
          <div className="space-y-1"><Label>{link ? "QuickBooks invoice number *" : "QuickBooks reference *"}</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={link ? "e.g. 1042" : "Payment, credit or refund number"} /></div>
          {!link && <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>}
          {error && <p className="text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || reference.trim().length < (link ? 1 : 2)} className="bg-red-600 hover:bg-red-700">{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}