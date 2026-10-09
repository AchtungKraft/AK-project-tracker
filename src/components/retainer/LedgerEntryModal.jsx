import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { parseDollarsToCents, formatCents, retainerAction } from "@/lib/retainerMoney";

export default function LedgerEntryModal({ retainer, entryType, onClose }) {
  const qc = useQueryClient();
  // One key per opened form: retries/double-clicks reuse it, so the server records at most one entry
  const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isDeposit = entryType === "deposit";
  const cents = parseDollarsToCents(amount);

  const submit = async () => {
    if (cents === null || cents === 0 || (isDeposit && cents < 0)) return setError(isDeposit ? "Enter a positive amount, e.g. 5000.00" : "Enter a non-zero amount; use a minus sign to reduce the balance.");
    if (reason.trim().length < 3) return setError("A reason is required.");
    setBusy(true); setError("");
    try {
      await retainerAction({ action: "record_entry", retainer_account_id: retainer.id, entry_type: entryType, amount_cents: cents, reason, external_reference: ref, idempotency_key: key });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["retainerLedger", retainer.id] }),
        qc.invalidateQueries({ queryKey: ["retainerBalance", retainer.id] }),
      ]);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white">
        <DialogHeader><DialogTitle>{isDeposit ? "Record Deposit" : "Manual Correction"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount (USD){!isDeposit && " — negative to reduce"}</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={isDeposit ? "5000.00" : "-25.00"} className="bg-gray-800 border-gray-700" />
            {cents !== null && cents !== 0 && <p className="text-xs text-gray-400 mt-1">Will record {formatCents(cents)}</p>}</div>
          <div><Label>Reason *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="bg-gray-800 border-gray-700" /></div>
          {isDeposit && <div><Label>Payment reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Check #, wire ref…" className="bg-gray-800 border-gray-700" /></div>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Record</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}