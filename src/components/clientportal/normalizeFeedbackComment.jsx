/**
 * normalizeFeedbackComment — Defensive frontend normalizer.
 *
 * ⚠️  LOCK: Must mirror backend normalizeComment() — do not extend independently.
 *     Any structural changes to the comment shape MUST originate in:
 *       - functions/getInternalFeedbackDetail.js  normalizeComment()
 *       - functions/publicClientRequestDetail.js  normalizeComment()
 *     This file exists solely as a safety net so the UI never crashes
 *     on missing or malformed fields.
 *
 * Guarantees every comment has:
 *   id, content_html, content_fallback, body, links[], photos[], files[],
 *   visibility, created_date, created_by, author_type, author_id,
 *   posted_at, author, author_display_name
 */
export function normalizeFeedbackComment(raw) {
  if (!raw) return null;

  // --- content chain: content_html → content_fallback → body ---
  const contentHtml = raw.content_html || null;
  const body = raw.body || '';
  const contentFallback = raw.content_fallback || body;

  // --- links: handle legacy string[], object[], or missing ---
  let links = [];
  if (Array.isArray(raw.links)) {
    links = raw.links.map((link, idx) => {
      if (typeof link === 'string') {
        // Legacy: plain URL string
        return { id: `legacy-${idx}`, name: link, url: link, description: null, type: 'external' };
      }
      // Modern structured link
      return {
        id: link.id || `link-${idx}`,
        name: link.name || link.url || '',
        url: link.url || '',
        description:
          typeof link.description === 'string'
            ? link.description
            : null,
        type: link.type || 'external',
      };
    });
  }

  // --- photos: always array of URL strings ---
  const photos = Array.isArray(raw.photos) ? raw.photos.filter(Boolean) : [];

  // --- files: always array of { name, url } ---
  let files = [];
  if (Array.isArray(raw.files)) {
    files = raw.files.map((f, idx) => {
      if (typeof f === 'string') {
        return { name: `File ${idx + 1}`, url: f };
      }
      return { name: f.name || `File ${idx + 1}`, url: f.url || '' };
    });
  }

  return {
    id: raw.id,
    request_id: raw.request_id,
    content_html: contentHtml,
    content_fallback: contentFallback,
    body: body,
    links,
    photos,
    files,
    visibility: raw.visibility || 'client_visible',
    created_date: raw.created_date || raw.posted_at || null,
    created_by: raw.created_by || raw.author_id || null,
    author_type: raw.author_type || null,
    author_id: raw.author_id || null,
    posted_at: raw.posted_at || raw.created_date || null,
    author: raw.author || null,
    author_display_name: raw.author_display_name || raw.author?.full_name || raw.author?.name || 'System',
    // Preserve target_type for image-level comments
    target_type: raw.target_type || 'request',
    target_attachment_id: raw.target_attachment_id || null,
  };
}

/**
 * Batch normalizer — convenience for arrays
 */
export function normalizeFeedbackComments(comments) {
  if (!Array.isArray(comments)) return [];
  return comments.map(normalizeFeedbackComment).filter(Boolean);
}