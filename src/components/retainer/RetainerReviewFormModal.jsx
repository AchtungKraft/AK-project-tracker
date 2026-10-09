import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { parseDollarsToCents, formatCents, retainerReviewAction } from "@/lib/retainerMoney";
import { formatHours } from "@/components/retainer/RetainerEstimateTable";

export default function RetainerReviewFormModal({ retainer, mode, review, onClose, onSaved }) {
  const [title, setTitle] = useState(review?.title || "");
  const [scope, setScope] = useState(review?.scope_description || "");
  const [hours, setHours] = useState(() => Object.fromEntries((review?.lines || []).map((l) => [l.labor_group_id, formatHours(l.hours_x100)])));
  const [taskIds, setTaskIds] = useState(review?.task_ids || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data: rates = [] } = useQuery({
    queryKey: ["retainerRates", retainer.id],
    queryFn: async () => (await base44.entities.RetainerRate.filter({ retainer_account_id: retainer.id, is_active: true }, { sort: "labor_group_name_snapshot", limit: 100 })).items,
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["retainerProjectTasks", retainer.designated_project_id],
    queryFn: async () => (await base44.entities.Task.filter({ project_id: retainer.designated_project_id }, { sort: "name", limit: 200, fields: ["name"] })).items,
  });

  const lines = rates.map((r) => ({ r, x100: parseDollarsToCents(hours[r.labor_group_id]) })).filter((l) => l.x100 > 0);
  const total = lines.reduce((a, l) => a + Math.round((l.x100 * l.r.negotiated_rate_cents) / 100), 0);

  const save = async () => {
    const bad = Object.values(hours).some((h) => h && !(parseDollarsToCents(h) >= 0));
    if (bad) return setError("Hours must be numbers with up to 2 decimals.");
    setBusy(true); setError("");
    try {
      await retainerReviewAction({
        action: mode === "create" ? "create_draft" : mode === "edit" ? "update_draft" : "revise",
        retainer_account_id: retainer.id, review_id: review?.id, title, scope_description: scope, task_ids: taskIds,
        lines: lines.map((l) => ({ labor_group_id: l.r.labor_group_id, hours_x100: l.x100 })),
      });
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{mode === "create" ? "New Retainer Review" : mode === "edit" ? "Edit Draft" : `Revise (creates revision ${review.revision + 1})`}</DialogTitle></DialogHeader>
        {mode === "revise" && <p className="text-xs text-orange-300">The current revision will be superseded and this scope goes back on hold until the client approves the new revision.</p>}
        <div className="space-y-3">
          <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-gray-800 border-gray-700" /></div>
          <div><Label>Scope of work *</Label><Textarea value={scope} onChange={(e) => setScope(e.target.value)} className="bg-gray-800 border-gray-700 min-h-[100px]" /></div>
          <div className="space-y-1">
            <Label>Estimated hours by labor group</Label>
            {rates.length === 0 && <p className="text-xs text-gray-500">Set negotiated rates on this retainer first.</p>}
            {rates.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <span className="w-40">{r.labor_group_name_snapshot}</span>
                <span className="w-40 text-gray-400">{formatCents(r.negotiated_rate_cents)}/hr <span className="line-through text-gray-600">{formatCents(r.standard_rate_cents_snapshot)}</span></span>
                <Input value={hours[r.labor_group_id] || ""} onChange={(e) => setHours({ ...hours, [r.labor_group_id]: e.target.value })} placeholder="0" className="w-24 bg-gray-800 border-gray-700" />
              </div>
            ))}
            <p className="text-sm text-right">Estimated: <span className="font-semibold">{formatCents(total)}</span></p>
          </div>
          <div>
            <Label>Tasks in the designated D&amp;D project</Label>
            <div className="max-h-40 overflow-y-auto rounded border border-gray-800 p-2 space-y-1">
              {tasks.length === 0 && <p className="text-xs text-gray-500">No tasks in this project.</p>}
              {tasks.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={taskIds.includes(t.id)} onCheckedChange={(c) => setTaskIds(c ? [...taskIds, t.id] : taskIds.filter((x) => x !== t.id))} />{t.name}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save Draft</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}