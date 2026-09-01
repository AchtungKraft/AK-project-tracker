import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, MessageSquare, Clock, AlertTriangle, ChevronDown, ChevronUp, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DECISION_LABELS, DECISION_COLORS } from "./scopeHelpers";
import StaffStatusOverrideMenu from "./StaffStatusOverrideMenu";
import ScopeItemPricingDisplay from "./ScopeItemPricingDisplay";
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

  // Compact internal layout uses two-column on desktop
  const useCompactLayout = isStaff && !isMobile;

  return (
    <div className={cn(
      "border rounded-lg transition-all",
      status === "approved" && "border-green-700/30 bg-green-950/5",
      status === "not_now" && "border-gray-700/30 bg-gray-900/20 opacity-70",
      status === "request_changes" && "border-orange-700/30 bg-orange-950/5",
      status === "reapproval_required" && "border-red-700/30 bg-red-950/5",
      status === "needs_review" && "border-gray-700/40 bg-gray-800/20",
    )}>
      <div className={cn("space-y-1.5", isMobile ? "p-3" : "px-3 py-2.5")}>
        {/* Row 1: Title + Status + ⋮ */}
        <div className="flex items-center justify-between gap-2">
          <h4 className={cn("font-semibold text-white truncate", isMobile ? "text-sm" : "text-sm")}>{item.title}</h4>
          <div className="flex items-center gap-1 shrink-0">
            <Badge className={cn("text-[10px] px-1.5 py-0 h-5 border", DECISION_COLORS[status])}>
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

        {/* Reapproval warning */}
        {status === "reapproval_required" && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/30 border border-red-700/30">
            <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
            <p className="text-[11px] text-red-300">
              {isClientView ? "Updated — please review again" : "Updated since approval — review required"}
            </p>
          </div>
        )}

        {/* Row 2: Body — two-column on internal desktop, stacked otherwise */}
        {useCompactLayout ? (
          <div className="flex gap-4">
            {/* Left: Description + Notes + Images */}
            <div className="flex-1 min-w-0 space-y-1">
              {item.description && (
                <p className="text-[13px] text-gray-400 leading-snug">{item.description}</p>
              )}
              {item.budget_note && item.pricing_model !== 'hard_cost_plus_labor' && (
                <p className="text-[11px] text-gray-500 italic">{item.budget_note}</p>
              )}
              {item.images?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap pt-0.5">
                  {item.images.slice(0, 5).map((url, idx) => (
                    <button key={idx} onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                      className="relative w-12 h-12 rounded overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {idx === 4 && item.images.length > 5 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="text-white font-semibold text-[10px]">+{item.images.length - 5}</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Right: Pricing */}
            <div className="shrink-0 w-52 text-right">
              <ScopeItemPricingDisplay item={item} laborEstimates={laborEstimates} isClientView={isClientView} isMobile={isMobile} compact={true} />
            </div>
          </div>
        ) : (
          /* Stacked: client view and mobile */
          <>
            <ScopeItemPricingDisplay item={item} laborEstimates={laborEstimates} isClientView={isClientView} isMobile={isMobile} />
            {item.description && (
              <p className={cn("text-gray-400 leading-relaxed text-sm")}>{item.description}</p>
            )}
            {item.budget_note && item.pricing_model !== 'hard_cost_plus_labor' && (
              <p className="text-xs text-gray-500 italic">{item.budget_note}</p>
            )}
            {item.images?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {item.images.slice(0, 4).map((url, idx) => (
                  <button key={idx} onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {idx === 3 && item.images.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white font-semibold text-xs">+{item.images.length - 4}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Lightbox */}
        {item.images?.length > 0 && (
          <ImageModal
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            images={item.images}
            currentIndex={lightboxIndex}
            onNavigate={setLightboxIndex}
          />
        )}

        {/* Decision audit + Actions footer — compact single row */}
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          {/* Client decision actions */}
          {!readOnly && (
            <>
              {(status === "needs_review" || status === "reapproval_required") && (
                <>
                  <Button size="sm" onClick={() => handleDecision("approved")} className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Approve
                  </Button>
                  <Button size="sm" onClick={() => { setShowComments(true); handleDecision("request_changes"); }} variant="outline" className="h-7 text-xs border-orange-600 text-orange-400 hover:bg-orange-950/30 gap-1">
                    <MessageSquare className="w-3 h-3" /> Changes
                  </Button>
                  <Button size="sm" onClick={() => handleDecision("not_now")} variant="outline" className="h-7 text-xs border-gray-600 text-gray-400 hover:bg-gray-800 gap-1">
                    <XCircle className="w-3 h-3" /> Not Now
                  </Button>
                </>
              )}
              {status === "request_changes" && (
                <>
                  <Button size="sm" onClick={() => handleDecision("approved")} className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Approve
                  </Button>
                  <Button size="sm" onClick={() => handleDecision("not_now")} variant="outline" className="h-7 text-xs border-gray-600 text-gray-400 hover:bg-gray-800 gap-1">
                    <XCircle className="w-3 h-3" /> Not Now
                  </Button>
                </>
              )}
              {status === "approved" && !isStaff && (
                <p className="text-[11px] text-green-400/70 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Approved
                </p>
              )}
              {status === "not_now" && (
                <Button size="sm" onClick={() => handleDecision("needs_review")} variant="outline" className="h-7 text-xs border-gray-600 text-gray-400 hover:bg-gray-800 gap-1">
                  <Clock className="w-3 h-3" /> Reconsider
                </Button>
              )}
            </>
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Decision audit — compact */}
          {latestDecisionEntry && status !== "needs_review" && (
            <span className="text-[10px] text-gray-600 hidden md:inline">
              {latestDecisionEntry.actor_name || 'Unknown'}
              {latestDecisionEntry.recorded_at && ` · ${format(new Date(latestDecisionEntry.recorded_at), "MMM d")}`}
            </span>
          )}

          {/* History toggle */}
          {isStaff && itemHistory.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1">
              <Clock className="w-3 h-3" /> {itemHistory.length}
            </button>
          )}

          {/* Comments toggle */}
          <button onClick={() => setShowComments(!showComments)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> {itemComments.length || ''}
          </button>
        </div>

        {/* History expandable */}
        {showHistory && isStaff && (
          <div className="space-y-1 pl-2 border-l-2 border-gray-700/40 pt-1">
            {itemHistory.map(h => (
              <div key={h.id} className="text-[10px] text-gray-500 leading-snug">
                <span className="text-gray-400">{h.actor_name || 'Unknown'}</span>
                {h.actor_type === 'internal_user' && <span className="text-gray-600"> Staff</span>}
                <span className="mx-0.5">→</span>
                <span className="text-gray-300">{DECISION_LABELS[h.decision] || h.event_type}</span>
                {h.note && <span className="text-gray-600 italic ml-1">— {h.note}</span>}
                {h.recorded_at && <span className="text-gray-700 ml-1">{format(new Date(h.recorded_at), "MMM d, h:mm a")}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Comments section */}
        {showComments && (
          <div className="space-y-1.5 pt-1 border-t border-gray-700/30">
            {itemComments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                  c.author_type === 'client_contact' ? "bg-cyan-900 text-cyan-300" : "bg-gray-700 text-gray-300"
                )}>
                  {(c.author_name || '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-gray-300">{c.author_name || 'Unknown'}</span>
                    <span className="text-[9px] text-gray-600">{c.created_date ? format(new Date(c.created_date), "MMM d") : ''}</span>
                  </div>
                  <p className="text-[12px] text-gray-400 mt-0.5 leading-snug">{c.body}</p>
                </div>
              </div>
            ))}
            {!readOnly && (
              <div className="flex gap-1.5 items-end">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="bg-gray-800/60 border-gray-700 text-white text-xs min-h-[32px] resize-none flex-1"
                  rows={1}
                />
                <Button size="sm" onClick={handleComment} disabled={!commentText.trim() || submitting} className="h-8 bg-gray-700 hover:bg-gray-600 px-2">
                  {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}