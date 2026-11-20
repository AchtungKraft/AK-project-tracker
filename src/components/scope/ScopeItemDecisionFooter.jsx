import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MessageSquare, Clock } from "lucide-react";
import { format } from "date-fns";

/** Deliverable-level decision actions + audit + comment/history toggles. Same handlers as before. */
export default function ScopeItemDecisionFooter({ status, readOnly, isStaff, onDecision, onRequestChanges, latestDecisionEntry, historyCount, commentCount, onToggleHistory, onToggleComments }) {
  const approve = <Button size="sm" onClick={() => onDecision("approved")} className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Approve</Button>;
  const notNow = <Button size="sm" onClick={() => onDecision("not_now")} variant="outline" className="h-8 text-xs border-gray-600 text-gray-400 hover:bg-gray-800 gap-1"><XCircle className="w-3.5 h-3.5" /> Not Now</Button>;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!readOnly && (status === "needs_review" || status === "reapproval_required") && (
        <>
          {approve}
          <Button size="sm" onClick={onRequestChanges} variant="outline" className="h-8 text-xs border-orange-600 text-orange-400 hover:bg-orange-950/30 gap-1"><MessageSquare className="w-3.5 h-3.5" /> Changes</Button>
          {notNow}
        </>
      )}
      {!readOnly && status === "request_changes" && <>{approve}{notNow}</>}
      {!readOnly && status === "approved" && !isStaff && (
        <p className="text-xs text-green-400/80 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Approved</p>
      )}
      {!readOnly && status === "not_now" && (
        <Button size="sm" onClick={() => onDecision("needs_review")} variant="outline" className="h-8 text-xs border-gray-600 text-gray-400 hover:bg-gray-800 gap-1"><Clock className="w-3.5 h-3.5" /> Reconsider</Button>
      )}

      <span className="flex-1" />

      {latestDecisionEntry && status !== "needs_review" && (
        <span className="text-[10px] text-gray-600 hidden md:inline">
          {latestDecisionEntry.actor_name || 'Unknown'}
          {latestDecisionEntry.recorded_at && ` · ${format(new Date(latestDecisionEntry.recorded_at), "MMM d")}`}
        </span>
      )}
      {isStaff && historyCount > 0 && (
        <button type="button" onClick={onToggleHistory} className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1 min-h-8 px-1">
          <Clock className="w-3.5 h-3.5" /> {historyCount}
        </button>
      )}
      <button type="button" onClick={onToggleComments} className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1 min-h-8 px-1">
        <MessageSquare className="w-3.5 h-3.5" /> Comments{commentCount ? ` (${commentCount})` : ''}
      </button>
    </div>
  );
}