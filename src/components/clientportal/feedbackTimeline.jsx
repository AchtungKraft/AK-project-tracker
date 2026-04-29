/**
 * Feedback Timeline Builder — SINGLE SOURCE for event resolution.
 *
 * Separates two concerns:
 *   - allEvents:   every comment + decision, NEVER filtered by posted_at.
 *                  Used for timeline display and hover previews.
 *   - stateEvents: only events AFTER the latest posted_at boundary.
 *                  Used for canonical state derivation and classification.
 *
 * IMPORTANT:
 * Do NOT filter timeline (allEvents) by posted_at.
 * Only state logic (stateEvents) should use time boundaries.
 */

/**
 * Normalize a decision timestamp for consistent sorting.
 * Always prefers decided_at, falls back to created_date.
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
    date: request.created_date,
  });

  if (request.posted_at) {
    allEvents.push({
      kind: 'request_posted',
      actor: 'team',
      date: request.posted_at,
    });
  }

  comments.forEach(c => {
    allEvents.push({
      kind: 'comment',
      actor: c.author_type === 'client_contact' ? 'client' : 'team',
      date: c.created_date,
      comment: c,
    });
  });

  // Sort decisions by decided_at before processing to guarantee stable ordering
  const sortedDecisions = [...decisions].sort(
    (a, b) => new Date(decisionTime(b)) - new Date(decisionTime(a))
  );

  sortedDecisions.forEach(d => {
    allEvents.push({
      kind: 'decision',
      actor: d.decided_by_type === 'client_contact' ? 'client' : 'team',
      date: decisionTime(d),
      decision: d,
    });
  });

  // Sort ALL events descending (most recent first)
  allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

  // ── Build STATE events (only after posted_at boundary) ──
  const postedAt = request.posted_at ? new Date(request.posted_at) : null;

  const stateEvents = postedAt
    ? allEvents.filter(e => new Date(e.date) > postedAt)
    : [];

  // ── Derive convenience accessors ──
  const latestDisplayEvent = allEvents[0] || null;
  const latestStateEvent = stateEvents[0] || null;

  return {
    allEvents,
    stateEvents,
    latestDisplayEvent,
    latestStateEvent,
  };
}