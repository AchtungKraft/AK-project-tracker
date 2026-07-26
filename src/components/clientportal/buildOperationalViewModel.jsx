/**
 * buildOperationalViewModel — SINGLE CANONICAL ENRICHMENT
 *
 * Produces the same enriched request shape regardless of entry point
 * (Hub via enrichRequest, or Detail page via this helper).
 *
 * Every Client Portal surface consumes this enriched object.
 * No UI component should calculate operational state independently.
 *
 * Enriched fields:
 *   latestActivityActor    — 'client' | 'team'
 *   latestActivityAt       — ISO timestamp of last display-worthy activity
 *   latestClientActivityAt — ISO timestamp of last client action (comment or decision)
 *   clientCommentCount     — number of client comments
 *   internalCommentCount   — number of internal comments
 *   latestCommentContent   — text preview of latest comment/decision
 *   latestCommentActor     — actor of latest comment/decision
 *   lastClientComment      — full comment object of last client comment (or null)
 *   isOverdue              — boolean
 *   waitingDays            — days since last client activity or posted_at
 *   reviewHours            — hours in current review (if in_review)
 *   isReviewStale          — review > 48h
 *   isArchivedWithClientResponse — archived but client replied
 *   requiresTeamAction     — boolean
 *   approvedAt             — ISO timestamp of latest approval (or null)
 *   reviewSteps            — array of { label, date, done } for ReviewCycleSummary
 */

import { buildFeedbackTimeline, getEventTimestamp, getTime } from "./feedbackTimeline";
import { getRequestStateCanonical } from "./stateHelpers";
import { format } from "date-fns";

/**
 * Build the canonical operational view model for a single feedback request.
 *
 * @param {Object} request    — raw ClientFeedbackRequest record
 * @param {Array}  comments   — all ClientFeedbackComment records for this request
 * @param {Array}  decisions  — all ClientFeedbackDecision records for this request
 * @param {Array}  attachments — all ClientFeedbackAttachment records for this request (optional)
 * @returns {Object} enriched request with all derived operational fields
 */
export function buildOperationalViewModel(request, comments = [], decisions = [], attachments = []) {
  if (!request) return null;

  // ── Canonical state (single source of truth) ──
  const canonicalState = getRequestStateCanonical(request, decisions, attachments);

  // ── Timeline (single event source) ──
  const { allEvents, latestDisplayEvent, latestStateEvent } = buildFeedbackTimeline(
    request,
    comments,
    decisions
  );

  // ── Actor & activity derivation ──
  const latestActivityActor = latestDisplayEvent?.actor || 'team';
  const latestActivityAt = latestDisplayEvent?.date || request.updated_date;

  // ── Client activity ──
  const clientComments = comments.filter(c => c.author_type === 'client_contact');
  const internalComments = comments.filter(c => c.author_type !== 'client_contact');

  // Latest client action from allEvents (includes both comments and decisions)
  const latestClientEvent = allEvents.find(e => e.actor === 'client');
  const latestClientActivityAt = latestClientEvent?.date || null;

  // Last client comment object
  const lastClientCommentEvent = allEvents.find(e => e.kind === 'comment' && e.actor === 'client');
  const lastClientComment = lastClientCommentEvent?.comment || null;

  // ── Comment preview ──
  const latestInteractionEvent = allEvents.find(e => e.kind === 'comment' || e.kind === 'decision');
  const latestCommentContent = latestInteractionEvent?.kind === 'comment'
    ? (latestInteractionEvent.comment?.content_fallback || latestInteractionEvent.comment?.body || null)
    : (latestInteractionEvent?.body || null);
  const latestCommentActor = latestInteractionEvent?.actor || null;

  // ── Overdue check ──
  let isOverdue = false;
  if (request.due_date) {
    const due = new Date(request.due_date);
    due.setUTCHours(23, 59, 59, 999);
    isOverdue = due.getTime() < Date.now();
  }

  // ── Waiting days ──
  const waitingAnchor = latestClientActivityAt || request.posted_at;
  const waitingDays = waitingAnchor
    ? Math.floor((Date.now() - new Date(waitingAnchor).getTime()) / 86400000)
    : 0;

  // ── Review state ──
  const reviewHours = (request.review_state === 'in_review' && request.review_started_at)
    ? (Date.now() - new Date(request.review_started_at).getTime()) / 3600000
    : 0;
  const isReviewStale = request.review_state === 'in_review' && reviewHours > 48;

  // ── Archived with client response ──
  const isArchivedWithClientResponse =
    canonicalState.key === 'archived' &&
    latestActivityActor === 'client';

  // ── Requires team action ──
  const requiresTeamAction =
    (
      canonicalState.key !== 'archived' &&
      (
        isOverdue ||
        latestActivityActor === 'client' ||
        canonicalState.key === 'approved'
      )
    ) ||
    isArchivedWithClientResponse;

  // ── Approval timestamp ──
  const approvalDecisions = decisions.filter(d => d.decision === 'approved');
  const approvedAt = approvalDecisions.length > 0
    ? approvalDecisions.reduce((latest, d) => {
        const ts = getEventTimestamp(d);
        const tMs = getTime(ts);
        return tMs > getTime(latest || '1970-01-01') ? ts : latest;
      }, null)
    : null;

  // ── Review cycle steps (for ReviewCycleSummary) ──
  const reviewSteps = buildReviewSteps(request, latestClientActivityAt);

  return {
    ...request,
    // Canonical state
    canonicalState,
    // Activity
    latestActivityActor,
    latestActivityAt,
    latestClientActivityAt,
    // Comment counts
    clientCommentCount: clientComments.length,
    internalCommentCount: internalComments.length,
    totalCommentCount: clientComments.length,
    // Comment preview
    latestCommentContent,
    latestCommentActor,
    lastClientComment,
    // Operational flags
    isOverdue,
    waitingDays,
    reviewHours,
    isReviewStale,
    isArchivedWithClientResponse,
    requiresTeamAction,
    approvedAt,
    // Review cycle
    reviewSteps,
    // Preserved for attention card compatibility
    decisions,
  };
}

/**
 * Build review progression steps for ReviewCycleSummary.
 * Pure data — no React, no rendering logic.
 */
function buildReviewSteps(request, latestClientActivityAt) {
  if (!request.posted_at) return [];

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

  const hasClientReply = !!latestClientActivityAt;
  steps.push({
    label: "Client Replied",
    date: hasClientReply
      ? format(new Date(latestClientActivityAt), "MMM d")
      : null,
    done: hasClientReply,
  });

  // Team replied step — only if client replied first and internal viewed after
  if (hasClientReply && request.last_viewed_by_internal_at) {
    const internalDate = new Date(request.last_viewed_by_internal_at);
    const clientDate = new Date(latestClientActivityAt);
    if (internalDate > clientDate) {
      steps.push({
        label: "Team Replied",
        date: format(internalDate, "MMM d"),
        done: true,
      });
    }
  }

  return steps;
}