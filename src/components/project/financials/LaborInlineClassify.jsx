import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import useLaborBillingAction from "./useLaborBillingAction";

// Per-task classification. In-service needs a service pick + explicit Save.
export default function LaborInlineClassify({ projectId, t, services }) {
  const [pending, setPending] = useState(false);
  const [svc, setSvc] = useState(t.service_commitment_id || "");
  const action = useLaborBillingAction(projectId);
  const save = (billing_type, service_commitment_id) =>
    action.mutate({ action: "classify_tasks", task_ids: [t.id], billing_type, service_commitment_id }, { onSuccess: () => setPending(false) });
  const onType = (v) => (v === "INCLUDED_IN_SERVICE" ? setPending(true) : save(v));

  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Select value={pending ? "INCLUDED_IN_SERVICE" : t.billing_type} onValueChange={onType} disabled={action.isPending}>
        <SelectTrigger aria-label="Classification" className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="UNCLASSIFIED">Unclassified</SelectItem>
          <SelectItem value="BILLABLE">Billable</SelectItem>
          <SelectItem value="INCLUDED_IN_SERVICE">In service</SelectItem>
          <SelectItem value="NON_BILLABLE">Non-billable</SelectItem>
        </SelectContent>
      </Select>
      {pending && (
        <>
          <Select value={svc} onValueChange={setSvc}>
            <SelectTrigger aria-label="Service" className="h-7 w-44 text-xs"><SelectValue placeholder={services.length ? "Select service" : "No services"} /></SelectTrigger>
            <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.description}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="h-7 px-2 bg-red-600 hover:bg-red-700" disabled={!svc || action.isPending} onClick={() => save("INCLUDED_IN_SERVICE", svc)}>Save</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-400" onClick={() => { setPending(false); setSvc(t.service_commitment_id || ""); }}>Cancel</Button>
        </>
      )}
      {action.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
    </div>
  );
}