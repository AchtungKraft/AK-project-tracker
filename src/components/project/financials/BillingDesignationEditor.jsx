import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import useLaborBillingAction from "./useLaborBillingAction";

// Admin: mark the project Billable / Non-Billable (reason required, logged). Non-Billable removes it from
// Ready to Invoice and blocks new invoicing; costs, workload, inventory, purchasing and history are unchanged.
export default function BillingDesignationEditor({ projectId, lb }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const action = useLaborBillingAction(projectId);
  const nonBillable = lb.billing_designation === "NON_BILLABLE";
  const next = nonBillable ? "BILLABLE" : "NON_BILLABLE";
  const save = () => action.mutate({ action: "set_billing_designation", designation: next, reason: reason.trim() }, { onSuccess: () => { setOpen(false); setReason(""); } });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span>Client billing
          {lb.designation_set_by && <span className="block text-[11px] text-gray-500">Set by {lb.designation_set_by} · {new Date(lb.designation_set_at).toLocaleDateString()}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className={nonBillable ? "text-amber-400" : "text-emerald-400"}>{nonBillable ? "Non-Billable" : "Billable"}</span>
          {!open && <Button size="sm" variant="ghost" className="h-7 text-gray-400" onClick={() => setOpen(true)}>Change</Button>}
        </span>
      </div>
      {nonBillable && <p className="text-xs text-amber-400">Excluded from Ready to Invoice and new invoices. Costs and history are kept.</p>}
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Reason for marking ${nonBillable ? "Billable" : "Non-Billable"}`} className="h-8 flex-1 min-w-[12rem]" />
          <Button size="sm" disabled={!reason.trim() || action.isPending} onClick={save} className="bg-red-600 hover:bg-red-700 h-8">
            {action.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Mark ${nonBillable ? "Billable" : "Non-Billable"}`}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-gray-400" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}