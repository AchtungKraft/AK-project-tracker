/**
 * Centralized public Client Portal URL generation.
 * All client-facing links MUST use this helper.
 * Internal domain must NEVER appear in client-facing URLs.
 */

const CLIENT_PORTAL_DOMAIN = 'https://akclient.base44.app';

/**
 * Build a public client portal URL.
 * @param {'portal'|'request'} type
 * @param {object} params
 * @param {string} params.slug - Required. Client URL slug.
 * @param {string} [params.requestId] - Required when type='request'.
 * @returns {string|null} The public URL, or null if inputs are invalid.
 */
export function buildPublicClientUrl({ type, slug, requestId }) {
  if (!slug) return null;
  const encodedSlug = encodeURIComponent(slug);

  switch (type) {
    case 'portal':
      return `${CLIENT_PORTAL_DOMAIN}/ClientProjects?slug=${encodedSlug}`;
    case 'request':
      if (!requestId) return null;
      return `${CLIENT_PORTAL_DOMAIN}/ClientFeedbackRequestDetail?id=${encodeURIComponent(requestId)}&slug=${encodedSlug}`;
    default:
      return null;
  }
}

export { CLIENT_PORTAL_DOMAIN };