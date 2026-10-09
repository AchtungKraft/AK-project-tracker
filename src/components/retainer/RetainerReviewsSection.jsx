import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus } from "lucide-react";
import { formatCents, retainerReviewAction } from "@/lib/retainerMoney";
import { formatHours } from "@/components/retainer/RetainerEstimateTable";
import RetainerReviewFormModal from "@/components/retainer/RetainerReviewFormModal";

const STATUS = {
  draft: ["Draft · on hold", "text-gray-300"], in_client_review: ["Awaiting client", "text-blue-300"],
  approved: ["Approved", "text-emerald-300"], changes_requested: ["Changes requested · on hold", "text-orange-300"],
};

export default function RetainerReviewsSection({ retainer }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["retainerReviews", retainer.id],
    queryFn: async () => (await base44.entities.RetainerReview.filter({ retainer_account_id: retainer.id, is_current: true }, { sort: "-updated_date", limit: 50 })).items,
  });
  const { data: snaps = [] } = useQuery({
    queryKey: ["retainerSnapshots", retainer.id],
    queryFn: async () => (await base44.entities.RetainerApprovalSnapshot.filter({ retainer_account_id: retainer.id }, { sort: "-decided_at", limit: 100 })).items,
  });
  const refresh = () => ["retainerReviews", "retainerSnapshots", "retainerReviewTotals"].forEach((k) => qc.invalidateQueries({ queryKey: [k, retainer.id] }));

  const send = async (r) => {
    setBusyId(r.id); setError("");
    try { await retainerReviewAction({ action: "send_to_client", review_id: r.id }); refresh(); }
    catch (e) { setError(e.message); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Retainer reviews</h2>
        <Button size="sm" variant="outline" onClick={() => setForm({ mode: "create" })} disabled={!retainer.designated_project_id}><Plus className="w-4 h-4 mr-1" />New Review</Button>
      </div>
      {!retainer.designated_project_id && <p className="text-xs text-gray-500">Choose a designated D&amp;D project above to author reviews.</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : reviews.length === 0 ? <p className="text-sm text-gray-400">No reviews yet.</p> : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 divide-y divide-gray-800 text-sm">
          {reviews.map((r) => {
            const last = snaps.find((s) => s.request_id === r.request_id);
            const [label, color] = STATUS[r.status] || [r.status, "text-gray-300"];
            return (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-white">{r.title} <Badge variant="outline" className="ml-1 text-gray-400">Rev {r.revision}</Badge></p>
                  <p className={`text-xs ${color}`}>{label}{last && ` · last decision: ${last.decision.replace("_", " ")} by ${last.reviewer_name} (rev ${last.revision}) ${new Date(last.decided_at).toLocaleString()}`}</p>
                  {last?.note && <p className="text-xs text-gray-500">“{last.note}”</p>}
                </div>
                <span className="text-gray-300">{formatHours(r.est_hours_x100)} hrs</span>
                <span className="text-white">{formatCents(r.est_negotiated_cents)}</span>
                <span className="text-gray-500">{r.task_ids?.length || 0} tasks</span>
                {r.status === "draft" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setForm({ mode: "edit", review: r })}>Edit</Button>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={busyId === r.id} onClick={() => send(r)}>{busyId === r.id && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Send to Client</Button>
                  </>
                ) : <Button size="sm" variant="outline" onClick={() => setForm({ mode: "revise", review: r })}>Revise</Button>}
              </div>
            );
          })}
        </div>
      )}
      {form && <RetainerReviewFormModal retainer={retainer} {...form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </div>
  );
}