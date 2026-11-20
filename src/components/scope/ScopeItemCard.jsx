import React, { useState } from "react";
import { AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHoursRange } from "./scopeHelpers";
import { computeScopeItemPricing, formatDollarRange } from "./scopePricingHelpers";
import { getHardCostRows, getLaborRows, getExtraNotes } from "./scopeItemDisplay";
import ScopeTaskConversionBadge from "./ScopeTaskConversionBadge";
import ScopeItemHeader from "./ScopeItemHeader";
import ScopeItemWorkSection from "./ScopeItemWorkSection";
import ScopeItemComponentSection from "./ScopeItemComponentSection";
import ScopeItemDecisionFooter from "./ScopeItemDecisionFooter";
import ScopeItemActivity from "./ScopeItemActivity";

const COMPLEX_ROW_COUNT = 6;
const STATUS_FRAME = {
  approved: "border-green-700/40 bg-green-950/10",
  not_now: "border-gray-700/40 bg-gray-900/30 opacity-75",
  request_changes: "border-orange-700/40 bg-orange-950/10",
  reapproval_required: "border-red-700/50 bg-red-950/10",
  needs_review: "border-gray-700/60 bg-gray-800/30",
};

/** One deliverable: header → scope of work → hard costs → AK labor → decision footer. */
export default function ScopeItemCard({
  item, comments = [], history = [], laborEstimates = [],
  onDecision, onComment, onStaffStatusChange, onStaffRequireReapproval,
  isClientView = false, readOnly = false, onEdit, onCreateTask, isMobile = false,
}) {
  const status = item.decision_status || "needs_review";
  const isStaff = !isClientView;
  const awaitingClient = ["needs_review", "reapproval_required", "request_changes"].includes(status);
  const [showDetails, setShowDetails] = useState(awaitingClient);
  const [showComments, setShowComments] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pricing = computeScopeItemPricing(item, laborEstimates);
  const isLegacy = pricing.pricing_model === 'legacy_estimate';
  const hardRows = getHardCostRows(item);
  const notes = getExtraNotes(item, hardRows);
  const laborRows = getLaborRows(laborEstimates).map(r => ({
    key: r.key, label: r.category, description: r.description, value: r.hours,
    sub: isStaff && r.rate ? `${r.cost} · $${r.rate}/hr` : null,
  }));
  const showLaborDollars = isStaff || !isLegacy;
  const hardSubtotal = hardRows.length > 1 ? (pricing.hard_cost_tbd ? 'TBD' : formatDollarRange(pricing.hard_cost_min, pricing.hard_cost_max)) : null;
  const laborSubtotal = laborRows.length > 1
    ? [formatHoursRange(pricing.ak_hours_min, pricing.ak_hours_max), showLaborDollars && pricing.labor_estimated && formatDollarRange(pricing.ak_labor_min, pricing.ak_labor_max)].filter(Boolean).join(' · ')
    : (!isStaff && !isLegacy && laborRows.length === 1 && pricing.labor_estimated ? formatDollarRange(pricing.ak_labor_min, pricing.ak_labor_max) : null);
  const isComplex = hardRows.length + laborRows.length > COMPLEX_ROW_COUNT;
  const detailsVisible = !isComplex || showDetails;

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

  return (
    <div className={cn("border rounded-lg", STATUS_FRAME[status], isMobile ? "p-3" : "px-4 py-3.5")}>
      <div className="space-y-3">
        <ScopeItemHeader item={item} pricing={pricing} status={status} isStaff={isStaff}
          onStaffStatusChange={onStaffStatusChange} onStaffRequireReapproval={onStaffRequireReapproval} onEdit={onEdit} />

        {isStaff && <ScopeTaskConversionBadge itemId={item.id} onCreateTask={onCreateTask} />}
        {status === "reapproval_required" && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/30 border border-red-700/30">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">{isClientView ? "Updated — please review again" : "Updated since approval — review required"}</p>
          </div>
        )}

        <ScopeItemWorkSection item={item} notes={notes} />

        {isComplex && (
          <button type="button" onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showDetails ? "Hide Details" : `Show Details (${hardRows.length + laborRows.length} components)`}
          </button>
        )}

        {detailsVisible && (hardRows.length > 0 || laborRows.length > 0) && (
          <div className="space-y-3 border-t border-gray-700/40 pt-3">
            <ScopeItemComponentSection title="Hard Costs" accent="text-cyan-400" rows={hardRows} subtotal={hardSubtotal} />
            <ScopeItemComponentSection title="Ächtung Kraft Labor" accent="text-red-400" rows={laborRows} subtotal={laborSubtotal} />
          </div>
        )}

        {isStaff && !isLegacy && !pricing.labor_estimated && <p className="text-[11px] text-gray-500 italic">AK labor not estimated</p>}
        {isStaff && isLegacy && (
          <p className="text-[11px] text-amber-500/70 italic flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Pricing breakdown not yet classified</p>
        )}

        <div className="border-t border-gray-700/40 pt-2.5 space-y-2">
          <ScopeItemDecisionFooter status={status} readOnly={readOnly} isStaff={isStaff} onDecision={handleDecision}
            onRequestChanges={() => { setShowComments(true); handleDecision("request_changes"); }}
            latestDecisionEntry={itemHistory.find(h => h.event_type === 'decision')}
            historyCount={itemHistory.length} commentCount={itemComments.length}
            onToggleHistory={() => setShowHistory(!showHistory)} onToggleComments={() => setShowComments(!showComments)} />
          <ScopeItemActivity showHistory={showHistory && isStaff} history={itemHistory} showComments={showComments} comments={itemComments}
            readOnly={readOnly} commentText={commentText} setCommentText={setCommentText} onSubmit={handleComment} submitting={submitting} />
        </div>
      </div>
    </div>
  );
}