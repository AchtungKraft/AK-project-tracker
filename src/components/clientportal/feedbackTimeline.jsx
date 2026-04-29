/**
 * Feedback Timeline Builder — SINGLE SOURCE for event resolution.
 *
 * Separates two concerns:
 *   - allEvents:   every comment + decision, NEVER filtered by posted_at.
 *                  Used for timeline display and hover previews.
 *   - stateEvents: only events AFTER the latest posted_at boundary.
 *                  Used for canonical state derivation and classification.
 *
 * TIMESTAMP INVARIANT:
 * All dates are stored and compared as ISO-8601 UTC strings.
 * All parsing uses getTime() for numeric comparison — never locale-based.
 *
 * IMPORTANT:
 * Do NOT filter timeline (allEvents) by posted_at.
 * Only state logic (stateEvents) should use time boundaries.
 */

/**
 * Parse any date value into a UTC millisecond timestamp.
 * Returns 0 for null/undefined/invalid — sorts to the bottom.
 */
function getTime(d) {
  if (!d) return 0;
  const ms = new Date(d).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Normalize a date to ISO-8601 UTC string, or null.
 */
function normalizeDate(d) {
  if (!d) return null;
  const date = new Date(d);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Resolve the authoritative timestamp for a comment.
 * Prefers the server-assigned posted_at, falls back to created_date.
 */
function commentTime(c) {
  return c.posted_at || c.created_date;
}

/**
 * Resolve the authoritative timestamp for a decision.
 * Prefers decided_at, falls back to created_date.
 */
function decisionTime(d) {
  return d.decided_at || d.created_date;
}

/**
 * Build a unified event list from comments and decisions.
 * @param {Object}  request     – The feedback request
 * @param {Array}   comments    – All comments for this request (pre-filtered by request_id)
 * @param {Array}   decisions   – All decisions for this request (pre-filtered by request_id)
 * @returns {{ allEvents: Array, stateEvents: Array, latestDisplayEvent: Object|null, latestStateEvent: Object|null }}
 */
export function buildFeedbackTimeline(request, comments = [], decisions = []) {
  // ── Build ALL events (timeline display — full history, NO posted_at filter) ──
  const allEvents = [];

  allEvents.push({
    kind: 'request_created',
    actor: 'team',
    date: normalizeDate(request.created_date),
  });

  if (request.posted_at) {
    allEvents.push({
      kind: 'request_posted',
      actor: 'team',
      date: normalizeDate(request.posted_at),
    });
  }

  comments.forEach(c => {
    const date = normalizeDate(commentTime(c));
    allEvents.push({
      kind: 'comment',
      actor: c.author_type === 'client_contact' ? 'client' : 'team',
      date,
      comment: c,
    });
  });

  // Sort decisions by decided_at before processing to guarantee stable ordering
  const sortedDecisions = [...decisions].sort(
    (a, b) => getTime(decisionTime(b)) - getTime(decisionTime(a))
  );

  sortedDecisions.forEach(d => {
    const date = normalizeDate(decisionTime(d));
    allEvents.push({
      kind: 'decision',
      actor: d.decided_by_type === 'client_contact' ? 'client' : 'team',
      date,
      decision: d,
    });
  });

  // Sort ALL events descending (most recent first) using numeric comparison
  allEvents.sort((a, b) => getTime(b.date) - getTime(a.date));

  // ── Build STATE events (only after posted_at boundary) ──
  const postedAtMs = getTime(request.posted_at);

  const stateEvents = postedAtMs
    ? allEvents.filter(e => getTime(e.date) > postedAtMs)
    : [];

  // ── Derive convenience accessors ──
  const latestDisplayEvent = allEvents[0] || null;
  const latestStateEvent = stateEvents[0] || null;

  // DEV INTEGRITY ASSERTION — warn if posted request has no display events
  if (!latestDisplayEvent && request.posted_at) {
    console.warn('[buildFeedbackTimeline] No display events for posted request', request.id);
  }

  return {
    allEvents,
    stateEvents,
    latestDisplayEvent,
    latestStateEvent,
  };
}