import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ListChecks } from "lucide-react";
import { money, hrs } from "./finFormat";
import LaborRateEditor from "./LaborRateEditor";
import LaborTaskClassifier from "./LaborTaskClassifier";

const Row = ({ label, value, muted }) => (
  <div className={`flex justify-between gap-3 ${muted ? "text-gray-500" : ""}`}><span>{label}</span><span className="tabular-nums">{value}</span></div>
);

export default function FinancialLaborBilling({ projectId, lb }) {
  const [open, setOpen] = useState(false);
  const h = lb.hours;
  const needs = lb.unclassified_tasks + lb.invalid_service_links + lb.unpriced_tasks;
  return (
    <div className="rounded-lg border border-red-900/30 bg-black/40 p-3 text-sm text-gray-300">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-medium text-white">Labor billing <span className="text-xs text-gray-500">(estimated, not invoiced)</span></div>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} className="h-8 border-gray-700 text-gray-200">
          <ListChecks className="w-4 h-4 mr-1" />{open ? "Hide tasks" : "Classify tasks"}{needs > 0 && <span className="ml-1 text-amber-400">({needs})</span>}
        </Button>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-1.5">
        <div className="space-y-1.5">
          <Row label="Total logged" value={hrs(h.logged)} />
          <Row label="Separately billable" value={hrs(h.billable)} />
          <Row label="Included in a service" value={hrs(h.included_in_service)} />
          <Row label="Non-billable" value={hrs(h.non_billable)} />
          <Row label="Unclassified (not billed)" value={<span className={h.unclassified > 0 ? "text-amber-400" : ""}>{hrs(h.unclassified)}</span>} />
          {h.cancelled_tasks > 0 && <Row muted label="On cancelled tasks" value={hrs(h.cancelled_tasks)} />}
        </div>
        <div className="space-y-1.5">
          <LaborRateEditor projectId={projectId} lb={lb} />
          <Row label="Labor billable to date" value={money(lb.billable_to_date)} />
          <Row label={`Remaining billable estimate (${hrs(lb.remaining_billable_hours)})`} value={money(lb.projected_remaining)} />
          <Row label="Projected total labor" value={money(lb.projected_total)} />
          {h.billable_unpriced > 0 && <Row muted label="Billable hours without a rate" value={hrs(h.billable_unpriced)} />}
        </div>
      </div>
      {open && <LaborTaskClassifier projectId={projectId} lb={lb} />}
    </div>
  );
}