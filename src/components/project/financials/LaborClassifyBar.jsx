import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import useLaborBillingAction from "./useLaborBillingAction";

// Bulk-apply a classification (and optional rate override) to selected tasks.
export default function LaborClassifyBar({ projectId, services, selectedIds, onDone }) {
  const [type, setType] = useState("BILLABLE");
  const [svc, setSvc] = useState("");
  const [override, setOverride] = useState("keep");
  const [rate, setRate] = useState("");
  const action = useLaborBillingAction(projectId);
  const n = rate === "" ? null : Number(rate);
  const badRate = override === "set" && (n == null || !Number.isFinite(n) || n < 0);
  const needSvc = type === "INCLUDED_IN_SERVICE" && !svc;
  const apply = () => {
    const payload = { action: "classify_tasks", task_ids: selectedIds, billing_type: type };
    if (type === "INCLUDED_IN_SERVICE") payload.service_commitment_id = svc;
    if (override === "set") payload.rate_override = n;
    if (override === "clear") payload.rate_override = null;
    action.mutate(payload, { onSuccess: onDone });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded bg-gray-900/60 p-2 text-xs">
      <span className="text-gray-400">{selectedIds.length} selected →</span>
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="BILLABLE">Billable</SelectItem>
          <SelectItem value="INCLUDED_IN_SERVICE">Included in service</SelectItem>
          <SelectItem value="NON_BILLABLE">Non-billable</SelectItem>
          <SelectItem value="UNCLASSIFIED">Unclassified</SelectItem>
        </SelectContent>
      </Select>
      {type === "INCLUDED_IN_SERVICE" && (
        <Select value={svc} onValueChange={setSvc}>
          <SelectTrigger className="h-8 w-56"><SelectValue placeholder={services.length ? "Select service" : "No services on project"} /></SelectTrigger>
          <SelectContent>{services.map((s) => <SelectItem key={s.id} value={s.id}>{s.description}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Select value={override} onValueChange={setOverride}>
        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="keep">Keep task rate</SelectItem>
          <SelectItem value="set">Set rate override</SelectItem>
          <SelectItem value="clear">Clear override</SelectItem>
        </SelectContent>
      </Select>
      {override === "set" && <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="$/h" className="h-8 w-24" />}
      <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700" disabled={!selectedIds.length || needSvc || badRate || action.isPending} onClick={apply}>
        {action.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
      </Button>
    </div>
  );
}