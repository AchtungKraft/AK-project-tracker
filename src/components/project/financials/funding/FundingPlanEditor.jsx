import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, AlertTriangle } from "lucide-react";
import { cents } from "./fundingFormat";
import { draftFromPlan, evaluateDraft, approvedWarnings, newMilestone } from "./fundingDraft";
import AgreedBudgetEditor from "./AgreedBudgetEditor";
import MilestoneEditorRow from "./MilestoneEditorRow";
import FundingPlanHistory from "./FundingPlanHistory";

export default function FundingPlanEditor({ projectId, planData, approved }) {
  const qc = useQueryClient();
  const plan = planData.plan;
  const [draft, setDraft] = useState(() => draftFromPlan(plan));
  const [saveError, setSaveError] = useState(null);
  useEffect(() => { setDraft(draftFromPlan(plan)); setSaveError(null); }, [plan?.id, plan?.version]);
  const ev = useMemo(() => evaluateDraft(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromPlan(plan));
  const warnings = [...planData.warnings.map((w) => w.message), ...approvedWarnings(ev, approved)];
  const save = useMutation({
    mutationFn: async () => (await base44.functions.invoke("scopeFundingPlanAction", { action: "save_draft", project_id: projectId, expected_version: plan?.version || 0, ...ev.payload })).data,
    onSuccess: () => { setSaveError(null); qc.invalidateQueries({ queryKey: ["scopeFundingPlan", projectId] }); },
    onError: (e) => setSaveError({ message: e.response?.data?.errors?.join(" ") || e.response?.data?.error || e.message, conflict: e.response?.status === 409 }),
  });
  const setRow = (i, { calc, err, ...row }) => setDraft({ ...draft, milestones: draft.milestones.map((m, j) => (j === i ? row : m)) });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-gray-400">{plan ? `Draft v${plan.version} · last saved by ${plan.updated_by_email} ${new Date(plan.updated_at).toLocaleString()}` : "No funding plan saved yet."}</span>
        <span className="text-violet-300 font-semibold">Planned total (draft): {cents(ev.total)}</span>
      </div>
      <AgreedBudgetEditor draft={draft} setDraft={setDraft} plan={plan} />
      <div className="space-y-2">
        {ev.rows.map((r, i) => <MilestoneEditorRow key={r.id} row={r} index={i} options={planData.scope_options} onChange={(row) => setRow(i, row)} onRemove={() => setDraft({ ...draft, milestones: draft.milestones.filter((_, j) => j !== i) })} />)}
        <Button size="sm" variant="outline" disabled={draft.milestones.length >= 50} onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, newMilestone()] })} className="h-8"><Plus className="w-4 h-4 mr-1" />Add milestone</Button>
      </div>
      <Input value={draft.notes} maxLength={4000} placeholder="Plan notes (optional)" className="h-8 bg-gray-950 border-gray-700 text-white text-xs" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      {warnings.length > 0 && (
        <div className="text-xs text-amber-300 border border-amber-900/40 rounded-md p-2 space-y-0.5">
          {warnings.map((w) => <div key={w} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}</div>)}
        </div>
      )}
      {saveError && <div className="text-xs text-red-400">{saveError.message} {saveError.conflict && <button className="underline" onClick={() => qc.invalidateQueries({ queryKey: ["scopeFundingPlan", projectId] })}>Reload latest</button>}</div>}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <Input value={draft.changeNote} maxLength={500} placeholder="What changed? (saved with this version)" className="h-8 bg-gray-950 border-gray-700 text-white text-xs sm:max-w-sm" onChange={(e) => setDraft({ ...draft, changeNote: e.target.value })} />
        <Button size="sm" disabled={!dirty || ev.errors.length > 0 || save.isPending} onClick={() => save.mutate()} className="h-8 bg-violet-700 hover:bg-violet-600 text-white">
          {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save draft
        </Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(draftFromPlan(plan))} className="h-8 text-gray-400">Discard changes</Button>}
        {ev.errors.length > 0 && dirty && <span className="text-[11px] text-red-400">Fix {ev.errors.length} issue(s) to save.</span>}
      </div>
      <FundingPlanHistory versions={planData.versions} />
    </div>
  );
}