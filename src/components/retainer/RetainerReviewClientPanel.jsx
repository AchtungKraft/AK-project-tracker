import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { formatCents } from "@/lib/retainerMoney";
import RetainerEstimateTable from "@/components/retainer/RetainerEstimateTable";

const STATUS = { in_client_review: "Awaiting your approval", approved: "Approved", changes_requested: "Changes requested" };

export default function RetainerReviewClientPanel({ review, accessRole, token, slug, requestId, queryKey }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!review) return <p className="text-gray-400 text-sm">This review is being prepared.</p>;
  const canDecide = accessRole === "approver" && review.status === "in_client_review";

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("publicRetainerDecision", { token, slug, requestId, reviewId: review.id, contentHash: review.content_hash, decision: mode, note });
      if (!res.data?.success) throw new Error(res.data?.error || "Failed");
      setMode(null); setNote("");
      await qc.invalidateQueries({ queryKey });
    } catch (e) { setError(e?.response?.data?.error || e.message); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-black/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">Revision {review.revision}</span>
        <span className="text-sm font-medium text-violet-300">{STATUS[review.status] || review.status}</span>
      </div>
      <p className="text-gray-200 whitespace-pre-wrap">{review.scope_description}</p>
      <RetainerEstimateTable lines={review.lines} />
      <div className="text-right text-sm">
        {review.est_standard_cents > review.est_negotiated_cents && <p className="text-gray-500 line-through">Standard {formatCents(review.est_standard_cents)}</p>}
        <p className="text-white font-semibold">Estimated {formatCents(review.est_negotiated_cents)}</p>
        <p className="text-xs text-gray-500">Estimate only. Approving authorizes this scope; it does not charge your retainer.</p>
      </div>
      {review.task_names.length > 0 && (
        <div><p className="text-sm text-gray-400 mb-1">Covered tasks</p><ul className="list-disc pl-5 text-sm text-gray-300">{review.task_names.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
      )}
      {canDecide && !mode && (
        <div className="flex gap-2">
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setMode("approved")}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => setMode("changes_requested")}><AlertCircle className="w-4 h-4 mr-1" />Request Changes</Button>
        </div>
      )}
      {mode && (
        <div className="space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "approved" ? "Optional note" : "Describe the changes needed *"} className="bg-gray-800 border-gray-700 text-white" />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={busy} className={mode === "approved" ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{mode === "approved" ? "Confirm Approval" : "Send Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}