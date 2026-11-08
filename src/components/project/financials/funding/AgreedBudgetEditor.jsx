import React from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

// Agreed client billable budget: typed by an admin and explicitly confirmed. Never derived from estimates.
export default function AgreedBudgetEditor({ draft, setDraft, plan }) {
  return (
    <div className="rounded-md bg-gray-900/50 border border-gray-800 p-3 space-y-2 text-xs">
      <div className="grid sm:grid-cols-[200px_minmax(0,1fr)] gap-2 items-start">
        <label className="space-y-1">
          <span className="text-gray-400">Agreed client billable budget ($)</span>
          <Input value={draft.budget} inputMode="decimal" placeholder="e.g. 25000.00" className="h-8 bg-gray-950 border-gray-700 text-white"
            onChange={(e) => setDraft({ ...draft, budget: e.target.value, confirmed: false })} />
        </label>
        <label className="space-y-1">
          <span className="text-gray-400">Budget note (source of agreement)</span>
          <Input value={draft.budgetNote} maxLength={1000} placeholder="e.g. Signed proposal 11/02" className="h-8 bg-gray-950 border-gray-700 text-white"
            onChange={(e) => setDraft({ ...draft, budgetNote: e.target.value })} />
        </label>
      </div>
      <label className="flex items-start gap-2 text-gray-300">
        <Checkbox checked={draft.confirmed} disabled={!draft.budget.trim()} onCheckedChange={(v) => setDraft({ ...draft, confirmed: v === true })} className="mt-0.5" />
        <span>I confirm this amount was explicitly agreed with the client. It is not derived from cost ranges or estimates.</span>
      </label>
      {plan?.agreed_budget_confirmed && plan.agreed_budget_confirmed_by && (
        <p className="text-[11px] text-gray-500">Confirmed by {plan.agreed_budget_confirmed_by} on {new Date(plan.agreed_budget_confirmed_at).toLocaleString()}. Changing the amount clears the confirmation.</p>
      )}
    </div>
  );
}