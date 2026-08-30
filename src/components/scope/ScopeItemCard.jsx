import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, MessageSquare, Clock, AlertTriangle, ChevronDown, ChevronUp, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DECISION_LABELS, DECISION_COLORS, formatBudgetRange } from "./scopeHelpers";
import StaffStatusOverrideMenu from "./StaffStatusOverrideMenu";
import LaborSummaryInline from "./LaborSummaryInline";
import ImageModal from "@/components/ui/ImageModal";
import { format } from "date-fns";

export default function ScopeItemCard({
  item,
  comments = [],
  history = [],
  laborEstimates = [],
  onDecision,
  onComment,
  onStaffStatusChange,
  onStaffRequireReapproval,
  isClientView = false,
  readOnly = false,
  onEdit,
  isMobile = false,
}) {
  const [showComments, setShowComments] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const status = item.decision_status || "needs_review";
  const budget = formatBudgetRange(item.budget_min, item.budget_max, item.budget_tbd);
  const itemComments = comments.filter(c => c.scope_item_id === item.id).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  const itemHistory = history.filter(h => h.scope_item_id === item.id).sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  const latestDecisionEntry = itemHistory.find(h => h.event_type === 'decision');

  const isStaff = !isClientView;

  const handleDecision = async (decision) => {
    if (onDecision) await onDecision(item.id, decision);
  };

  const handleComment = async () => {
    if (!commentText.trim() || !onComment) return;
    setSubmitting(true);
    await onComment(item.id, commentText.trim());
    setCommentText("");
    setSubmitting(false);
    setShowComments(true);
  };

  return (
    <Card className={cn(
      "border transition-all",
      status === "approved" && "border-green-700/40 bg-green-950/10",
      status === "not_now" && "border-gray-700/40 bg-gray-900/30 opacity-70",
      status === "request_changes" && "border-orange-700/40 bg-orange-950/10",
      status === "reapproval_required" && "border-red-700/40 bg-red-950/10",
      status === "needs_review" && "border-gray-700/50 bg-gray-800/30",
    )}>
      <div className={cn("space-y-3", isMobile ? "p-3" : "p-4")}>
        {/* Title + Budget + Status + Staff Menu */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className={cn("font-semibold text-white", isMobile ? "text-sm" : "text-base")}>{item.title}</h4>
            {budget && (
              <p className={cn("font-medium mt-0.5", isMobile ? "text-sm" : "text-base",
                item.budget_tbd ? "text-gray-400 italic" : "text-cyan-400"
              )}>
                {budget}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge className={cn("text-xs border", DECISION_COLORS[status])}>
              {DECISION_LABELS[status]}
            </Badge>
            {isStaff && (
              <StaffStatusOverrideMenu
                item={item}
                onStatusChange={onStaffStatusChange}
                onRequireReapproval={onStaffRequireReapproval}
                onEdit={onEdit}
              />
            )}
          </div>
        </div>

        {/* Reapproval warning — client-facing version */}
        {status === "reapproval_required" && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-red-950/30 border border-red-700/30">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">
              {isClientView ? "Updated — please review again" : "Updated since approval — review required"}
            </p>
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p className={cn("text-gray-400 leading-relaxed", "text-sm")}>{item.description}</p>
        )}

        {/* AK Labor Summary */}
        <LaborSummaryInline laborEstimates={laborEstimates} isClientView={isClientView} />

        {/* Budget Note */}
        {item.budget_note && (
          <p className="text-xs text-gray-500 italic">{item.budget_note}</p>
        )}

        {/* Images */}
        {item.images?.length > 0 && (
          <>
            <div className="flex gap-2 flex-wrap">
              {item.images.slice(0, 4).map((url, idx) => (
                <button key={idx} onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {idx === 3 && item.images.length > 4 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white font-semibold text-sm">+{item.images.length - 4}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <ImageModal
              isOpen={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              images={item.images}
              currentIndex={lightboxIndex}
              onNavigate={setLightboxIndex}
            />
          </>
        )}

        {/* Decision audit — latest */}
        {latestDecisionEntry && status !== "needs_review" && (
          <p className="text-xs text-gray-500">
            {DECISION_LABELS[latestDecisionEntry.decision]} by {latestDecisionEntry.actor_name || 'Unknown'}
            {latestDecisionEntry.actor_type === 'internal_user' && !isClientView && (
              <span className="text-gray-600"> · Staff</span>
            )}
            {latestDecisionEntry.recorded_at && ` · ${format(new Date(latestDecisionEntry.recorded_at), "MMM d, h:mm a")}`}
          </p>
        )}

        {/* Client Decision Actions — only for appropriate states */}
        {!readOnly && (
          <div className={cn("flex gap-2 pt-1", isMobile ? "flex-col" : "flex-wrap")}>
            {(status === "needs_review" || status === "reapproval_required") && (
              <>
                <Button size="sm" onClick={() => handleDecision("approved")} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </Button>
                <Button size="sm" onClick={() => { setShowComments(true); handleDecision("request_changes"); }} variant="outline" className="border-orange-600 text-orange-400 hover:bg-orange-950/30 gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Request Changes
                </Button>
                <Button size="sm" onClick={() => handleDecision("not_now")} variant="outline" className="border-gray-600 text-gray-400 hover:bg-gray-800 gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Not Now
                </Button>
              </>
            )}
            {status === "request_changes" && (
              <>
                <Button size="sm" onClick={() => handleDecision("approved")} className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </Button>
                <Button size="sm" onClick={() => handleDecision("not_now")} variant="outline" className="border-gray-600 text-gray-400 hover:bg-gray-800 gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Not Now
                </Button>
              </>
            )}
            {status === "approved" && !isStaff && (
              <p className="text-xs text-green-400/70 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Approved
              </p>
            )}
            {status === "not_now" && (
              <Button size="sm" onClick={() => handleDecision("needs_review")} variant="outline" className="border-gray-600 text-gray-400 hover:bg-gray-800 gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Reconsider
              </Button>
            )}
          </div>
        )}

        {/* History toggle — staff only */}
        {isStaff && itemHistory.length > 0 && (
          <>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              <Clock className="w-3 h-3" />
              {itemHistory.length} history event{itemHistory.length !== 1 ? 's' : ''}
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showHistory && (
              <div className="space-y-1.5 pl-2 border-l-2 border-gray-700/40">
                {itemHistory.map(h => (
                  <div key={h.id} className="text-[11px] text-gray-500">
                    <span className="text-gray-400">{h.actor_name || 'Unknown'}</span>
                    {h.actor_type === 'internal_user' && <span className="text-gray-600"> · Staff</span>}
                    {h.actor_type === 'client_contact' && <span className="text-cyan-700"> · Client</span>}
                    <span className="mx-1">→</span>
                    <span className="text-gray-300">{DECISION_LABELS[h.decision] || h.event_type}</span>
                    {h.previous_decision && h.previous_decision !== h.decision && (
                      <span className="text-gray-600"> (was {DECISION_LABELS[h.previous_decision]})</span>
                    )}
                    {h.note && <span className="text-gray-600 italic ml-1">— {h.note}</span>}
                    {h.recorded_at && (
                      <span className="text-gray-700 ml-1">{format(new Date(h.recorded_at), "MMM d, h:mm a")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Comments toggle */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <MessageSquare className="w-3 h-3" />
          {itemComments.length > 0 ? `${itemComments.length} comment${itemComments.length > 1 ? 's' : ''}` : 'Add comment'}
          {showComments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* Comments section */}
        {showComments && (
          <div className="space-y-2 pt-1 border-t border-gray-700/30">
            {itemComments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                  c.author_type === 'client_contact' ? "bg-cyan-900 text-cyan-300" : "bg-gray-700 text-gray-300"
                )}>
                  {(c.author_name || '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-300">{c.author_name || 'Unknown'}</span>
                    <span className="text-[10px] text-gray-600">{c.created_date ? format(new Date(c.created_date), "MMM d, h:mm a") : ''}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5">{c.body}</p>
                </div>
              </div>
            ))}

            {/* Comment input */}
            {!readOnly && (
              <div className="flex gap-2 items-end">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="bg-gray-800/60 border-gray-700 text-white text-sm min-h-[40px] resize-none flex-1"
                  rows={1}
                />
                <Button size="sm" onClick={handleComment} disabled={!commentText.trim() || submitting} className="h-9 bg-gray-700 hover:bg-gray-600">
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}