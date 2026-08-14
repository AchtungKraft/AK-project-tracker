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

/**
 * Parse a date-only string (YYYY-MM-DD) into local calendar-day start.
 * new Date("2026-08-17") → UTC midnight, which is WRONG for local-date
 * comparison. Instead we split and use year/month/day constructor which
 * produces local midnight — matching the app's business calendar (America/Chicago).
 */
function localDateStartMs(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return 0;
  // Handle date-only: "2026-08-17"
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return 0;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

/**
 * Get the start of today in local time (midnight).
 */
function localTodayStartMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

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

  // ── 1. Archived → excluded (strongest exclusion) ──
  // Archive status is sufficient — no need to check or clear review_state,
  // queue_hidden, or any other operational overlay. Historical metadata
  // is deliberately preserved.
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
      const resumeMs = localDateStartMs(resumeDate);
      const todayMs = localTodayStartMs();
      // Resume on the calendar date in local timezone:
      // todayMs >= resumeMs means the resume day has arrived
      if (resumeMs && todayMs >= resumeMs) {
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