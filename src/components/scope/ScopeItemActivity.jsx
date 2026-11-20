import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DECISION_LABELS } from "./scopeHelpers";

/** Decision history (staff) and comment thread for one deliverable. */
export default function ScopeItemActivity({ showHistory, history, showComments, comments, readOnly, commentText, setCommentText, onSubmit, submitting }) {
  return (
    <>
      {showHistory && (
        <div className="space-y-1 pl-2 border-l-2 border-gray-700/40">
          {history.map(h => (
            <div key={h.id} className="text-[11px] text-gray-500 leading-snug">
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
      {showComments && (
        <div className="space-y-2 pt-2 border-t border-gray-700/30">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2">
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                c.author_type === 'client_contact' ? "bg-cyan-900 text-cyan-300" : "bg-gray-700 text-gray-300")}>
                {(c.author_name || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-gray-300">{c.author_name || 'Unknown'}</span>
                  <span className="text-[10px] text-gray-600">{c.created_date ? format(new Date(c.created_date), "MMM d") : ''}</span>
                </div>
                <p className="text-[13px] text-gray-400 mt-0.5 leading-snug break-words">{c.body}</p>
              </div>
            </div>
          ))}
          {!readOnly && (
            <div className="flex gap-1.5 items-end">
              <Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment..."
                className="bg-gray-800/60 border-gray-700 text-white text-xs min-h-[36px] resize-none flex-1" rows={1} />
              <Button size="sm" onClick={onSubmit} disabled={!commentText.trim() || submitting} className="h-9 bg-gray-700 hover:bg-gray-600 px-2.5">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}