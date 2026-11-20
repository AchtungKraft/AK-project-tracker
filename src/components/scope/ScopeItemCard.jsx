import React, { useState } from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeScopeItemPricing } from "./scopePricingHelpers";
import { getHardCostRows, getLaborRows, getExtraNotes } from "./scopeItemDisplay";
import ScopeItemHeader from "./ScopeItemHeader";
import ScopeItemWorkSection from "./ScopeItemWorkSection";
import ScopeItemComponentSection from "./ScopeItemComponentSection";
import ScopeItemDecisionFooter from "./ScopeItemDecisionFooter";
import ScopeItemActivity from "./ScopeItemActivity";

const STATUS_ACCENT = {
  approved: "border-l-green-500/80",
  not_now: "border-l-gray-500/70 opacity-75",
  request_changes: "border-l-orange-500/80",
  reapproval_required: "border-l-red-500",
  needs_review: "border-l-amber-500/80",
};
const SECTION = "border-t border-gray-700/40 pt-2";

/** One deliverable: header → scope of work → hard costs → AK labor → decision footer. */
export default function ScopeItemCard({
  item, comments = [], history = [], laborEstimates = [],
  onDecision, onComment, onStaffStatusChange, onStaffRequireReapproval,
  isClientView = false, readOnly = false, onEdit, onCreateTask, isMobile = false,
}) {
  const status = item.decision_status || "needs_review";
  const isStaff = !isClientView;
  const [showComments, setShowComments] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pricing = computeScopeItemPricing(item, laborEstimates);
  const isLegacy = pricing.pricing_model === 'legacy_estimate';
  const hardRows = getHardCostRows(item);
  const notes = getExtraNotes(item, hardRows);
  const laborRows = getLaborRows(laborEstimates).map(r => ({
    key: r.key, label: r.category, description: r.description, hours: r.hours,
    value: isStaff && !r.tbd ? r.cost : null, sub: isStaff && r.rate ? `$${r.rate}/hr` : null, tbd: r.tbd,
  }));
  const showLaborDollars = isStaff || !isLegacy;
  const flexible = pricing.estimate_format === 'flexible';
  const emptyLabel = flexible ? null : "Not estimated";
  const hardSubtotal = hardRows.length > 1 ? pricing.hard_cost_label : null;
  const laborCostTotal = showLaborDollars ? pricing.ak_labor_label : null;
  const laborHoursSubtotal = laborRows.length > 1 ? pricing.ak_hours_label : null;
  // Clients don't see per-line labor cost, so they get the labor total even for a single line.
  const laborSubtotal = laborRows.length > 1 || !isStaff ? laborCostTotal : null;

  const itemComments = comments.filter(c => c.scope_item_id === item.id).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  const itemHistory = history.filter(h => h.scope_item_id === item.id).sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));

  const handleDecision = async (decision) => { if (onDecision) await onDecision(item.id, decision); };
  const handleComment = async () => {
    if (!commentText.trim() || !onComment) return;
    setSubmitting(true);
    await onComment(item.id, commentText.trim());
    setCommentText("");
    setSubmitting(false);
    setShowComments(true);
  };
  const pad = isMobile ? "px-3" : "px-4";

  return (
    <article className={cn("rounded-xl border border-gray-600/60 border-l-[3px] bg-gray-900/80 shadow-md shadow-black/30 overflow-hidden", STATUS_ACCENT[status])}>
      <header className={cn(pad, "py-2 bg-slate-800/75 border-b border-gray-600/50")}>
        <ScopeItemHeader item={item} pricing={pricing} status={status} isStaff={isStaff} onCreateTask={onCreateTask}
          onStaffStatusChange={onStaffStatusChange} onStaffRequireReapproval={onStaffRequireReapproval} onEdit={onEdit} />
      </header>

      <div className={cn(pad, "py-2.5 space-y-2.5")}>
        {status === "reapproval_required" && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/30 border border-red-700/30">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{isClientView ? "Updated — please review again" : "Updated since approval — review required"}</p>
          </div>
        )}

        <ScopeItemWorkSection item={item} notes={notes} />

        {/* A section renders only when it has at least one real line (TBD and description-only lines count). */}
        {!isLegacy && hardRows.length > 0 && (
          <div className={SECTION}>
            <ScopeItemComponentSection title="Hard Costs" accent="text-cyan-400" kind="hard" rows={hardRows} subtotal={hardSubtotal} emptyLabel={emptyLabel} />
          </div>
        )}
        {laborRows.length > 0 && (
          <div className={SECTION}>
            <ScopeItemComponentSection title="Ächtung Kraft Labor" accent="text-red-400" kind="labor" rows={laborRows}
              subtotalHours={laborHoursSubtotal} subtotal={laborSubtotal} emptyLabel={emptyLabel} />
          </div>
        )}

        {isStaff && isLegacy && (
          <p className="text-[11px] text-amber-500/70 italic flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Pricing breakdown not yet classified</p>
        )}

        <div className={cn(SECTION, "space-y-2")}>
          <ScopeItemDecisionFooter status={status} readOnly={readOnly} isStaff={isStaff} onDecision={handleDecision}
            onRequestChanges={() => { setShowComments(true); handleDecision("request_changes"); }}
            latestDecisionEntry={itemHistory.find(h => h.event_type === 'decision')}
            historyCount={itemHistory.length} commentCount={itemComments.length}
            onToggleHistory={() => setShowHistory(!showHistory)} onToggleComments={() => setShowComments(!showComments)} />
          <ScopeItemActivity showHistory={showHistory && isStaff} history={itemHistory} showComments={showComments} comments={itemComments}
            readOnly={readOnly} commentText={commentText} setCommentText={setCommentText} onSubmit={handleComment} submitting={submitting} />
        </div>
      </div>
    </article>
  );
}