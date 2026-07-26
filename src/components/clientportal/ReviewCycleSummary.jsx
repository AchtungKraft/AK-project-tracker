import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Review Cycle — PROGRESSION ONLY
 * 
 * Responsibility: "How has this review progressed?"
 * Shows the sequence of interactions as a visual flow:
 *   Sent → Viewed → Client Reply → Team Reply
 * 
 * Does NOT show: posted date (OperationalSummary), due date
 * (OperationalSummary), or waiting duration (NextAction).
 */
export default function ReviewCycleSummary({ request, comments = [], isMobile = false }) {
  if (!request?.posted_at) return null;

  // Derive latest client reply from comments (not always enriched on request)
  const latestClientReply = request.latestClientActivityAt || (() => {
    const clientComments = comments
      .filter(c => c.is_client_comment || c.actor === 'client')
      .map(c => c.created_date)
      .filter(Boolean);
    return clientComments.length > 0
      ? clientComments.sort((a, b) => new Date(b) - new Date(a))[0]
      : null;
  })();

  // Build steps in chronological order of the review cycle
  const steps = [];

  steps.push({
    label: "Sent",
    date: format(new Date(request.posted_at), "MMM d"),
    done: true,
  });

  steps.push({
    label: "Client Viewed",
    date: request.client_last_viewed_at
      ? format(new Date(request.client_last_viewed_at), "MMM d")
      : null,
    done: !!request.client_last_viewed_at,
  });

  const hasClientReply = !!latestClientReply;
  steps.push({
    label: "Client Replied",
    date: hasClientReply
      ? format(new Date(latestClientReply), "MMM d")
      : null,
    done: hasClientReply,
  });

  // Only show team reply step if client has replied first
  if (hasClientReply && request.last_viewed_by_internal_at) {
    const internalDate = new Date(request.last_viewed_by_internal_at);
    const clientDate = new Date(latestClientReply);
    if (internalDate > clientDate) {
      steps.push({
        label: "Team Replied",
        date: format(internalDate, "MMM d"),
        done: true,
      });
    }
  }

  // Don't render if there's only the "Sent" step — too trivial
  const completedSteps = steps.filter(s => s.done).length;
  if (completedSteps <= 1) return null;

  return (
    <div className={cn(
      "rounded-lg border border-gray-800/60 bg-gray-900/40 px-3 py-2",
      isMobile ? "mx-0" : ""
    )}>
      <div className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-1.5">
        Review Cycle
      </div>
      <div className={cn(
        "flex items-center gap-0 text-xs",
        isMobile ? "flex-wrap gap-y-1" : ""
      )}>
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <span className={cn("mx-1.5", step.done ? "text-gray-500" : "text-gray-800")}>→</span>
            )}
            <span className={cn(
              "whitespace-nowrap",
              step.done ? "text-gray-300" : "text-gray-700"
            )}>
              {step.label}
              {step.date && <span className="text-gray-500 ml-1">{step.date}</span>}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}