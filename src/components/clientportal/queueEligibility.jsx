/**
 * CANONICAL ACTION QUEUE ELIGIBILITY — Single Source of Truth
 *
 * Every surface that needs to know whether a Feedback Request belongs
 * in the Action Queue, and in which column, MUST use this helper.
 *
 * Evaluation order:
 *   1. Deleted    → excluded (handled upstream; never reaches here)
 *   2. Archived   → excluded (operational override)
 *   3. queue_hidden + future resume date → deferred (excluded until resume)
 *   4. queue_hidden + past/no resume     → resumed (eligible again)
 *   5. Lifecycle bucket determines column
 *
 * Consumers:
 *   - attentionHelpers.buildAttentionList (Action Queue board)
 *   - ClientPortalHub KPI summaryCounts
 *   - Any future surface needing queue membership
 */

import { getTime } from "./feedbackTimeline";

/**
 * Determine the full queue disposition of a feedback request.
 *
 * @param {Object} request — raw or enriched ClientFeedbackRequest
 * @param {Object} [canonicalState] — { key, label } from stateHelpers; if
 *   not provided, reads from request.canonicalState (enriched model).
 * @returns {{
 *   eligible: boolean,
 *   reason: string,
 *   isArchived: boolean,
 *   isDeferred: boolean,
 *   resumeDate: string|null,
 * }}
 */
export function getQueueDisposition(request, canonicalState) {
  const state = canonicalState || request?.canonicalState;
  const key = state?.key;

  // ── 1. Archived → excluded ──
  if (key === 'archived' || request?.status === 'archived') {
    return {
      eligible: false,
      reason: 'archived',
      isArchived: true,
      isDeferred: false,
      resumeDate: null,
    };
  }

  // ── 2. queue_hidden → check resume date ──
  if (request?.queue_hidden) {
    const resumeDate = request.queue_resume_date || null;
    if (resumeDate) {
      const resumeMs = getTime(resumeDate);
      // Resume at start of the resume day (UTC midnight)
      if (resumeMs && resumeMs <= Date.now()) {
        // Resume date has arrived → eligible again
        return {
          eligible: true,
          reason: 'resumed_by_date',
          isArchived: false,
          isDeferred: false,
          resumeDate,
        };
      }
    }
    // Still deferred
    return {
      eligible: false,
      reason: 'deferred',
      isArchived: false,
      isDeferred: true,
      resumeDate,
    };
  }

  // ── 3. Default → eligible ──
  return {
    eligible: true,
    reason: 'active',
    isArchived: false,
    isDeferred: false,
    resumeDate: null,
  };
}

/**
 * Quick boolean check — replaces the old isQueueHidden.
 * Returns true when the request should NOT appear in the Action Queue.
 */
export function isExcludedFromQueue(request, canonicalState) {
  return !getQueueDisposition(request, canonicalState).eligible;
}