/**
 * Journal HTML Sanitizer — Browser-Side Defensive Layer
 * 
 * IMPORTANT ARCHITECTURAL NOTE:
 * This is a DEFENSIVE browser-side sanitizer. It is NOT the primary security boundary.
 * The backend/API (getClientJournalEntries, sendJournalEntryEmail) owns canonical
 * sanitization and normalization. This utility provides defense-in-depth for the
 * frontend rendering and save paths.
 * 
 * Backend sanitization is REQUIRED separately — this file cannot replace it.
 * 
 * This sanitizer uses a DOM-based whitelist approach:
 * - Dangerous tags (script, iframe, form elements, etc.) are FULLY REMOVED including children
 * - Unknown/benign tags are UNWRAPPED (children preserved, tag removed)
 * - Only whitelisted attributes survive
 * - URLs are restricted to safe protocols (http:, https:, mailto:, tel:, relative)
 * - Classes are restricted to Quill formatting prefixes (ql-*)
 * 
 * Browser-only: requires DOMParser (not available in Deno/Node).
 */

// --- Tag classifications ---

/** Tags allowed to pass through sanitization unchanged */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's', 'b', 'i',
  'ul', 'ol', 'li',
  'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'img',
  'div', 'span', 'hr',
  'figure', 'figcaption',
]);

/**
 * Dangerous tags that are FULLY REMOVED (tag + all descendants).
 * These can execute code, load external resources, or capture user input.
 * Unlike benign unknown tags which are merely unwrapped, these are stripped entirely.
 */
const DANGEROUS_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet',
  'form', 'input', 'textarea', 'button', 'select', 'option', 'optgroup',
  'link', 'meta', 'base', 'noscript',
]);

// --- Attribute whitelists ---

/**
 * Allowed attributes per tag. Only these survive sanitization.
 * class is handled separately via isAllowedClass().
 */
const ALLOWED_ATTRS = {
  a: new Set(['href', 'target', 'rel', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan']),
};

// --- URL protocol whitelist ---

/** Protocols allowed in href and src attributes */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Check if a URL is safe. Allows relative URLs and safe protocols only.
 * Blocks javascript:, vbscript:, file:, data: (except data:image for inline images).
 */
function isSafeUrl(value, attrName) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Relative URLs are safe
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('#')) {
    return true;
  }

  // Try to parse as absolute URL
  try {
    const url = new URL(trimmed);
    // Allow data:image/* only for src attributes (inline uploaded images)
    if (url.protocol === 'data:' && attrName === 'src' && trimmed.startsWith('data:image/')) {
      return true;
    }
    return SAFE_PROTOCOLS.has(url.protocol);
  } catch {
    // If URL() fails, it's likely a relative URL without explicit protocol
    // Block anything that looks like it has a dangerous scheme
    const lc = trimmed.toLowerCase();
    if (lc.startsWith('javascript:') || lc.startsWith('vbscript:') || 
        lc.startsWith('file:') || lc.startsWith('data:')) {
      return false;
    }
    return true; // Relative path like "page.html" or "//cdn.example.com/img.png"
  }
}

/**
 * Check if a class name is allowed.
 * Only Quill formatting classes (ql-*) are preserved.
 * All other classes are stripped to prevent style injection.
 */
function isAllowedClass(className) {
  return className.startsWith('ql-');
}

/**
 * Sanitize an HTML string using DOM parsing and whitelist filtering.
 * 
 * Behavior:
 * - Dangerous tags → fully removed (tag + all children)
 * - Allowed tags → kept, with attributes filtered
 * - Unknown benign tags → unwrapped (children preserved)
 * - Anchors → forced to target="_blank" rel="noopener noreferrer"
 * - URLs → restricted to safe protocols
 * - Classes → only ql-* prefixed classes preserved
 * 
 * @param {string} html - Raw HTML string to sanitize
 * @returns {string} Sanitized HTML string
 */
export function sanitizeJournalHtml(html) {
  if (!html || typeof html !== 'string') return '';

  const trimmed = html.trim();
  if (!trimmed) return '';

  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(trimmed, 'text/html');
  } catch (e) {
    console.warn('sanitizeJournalHtml: DOMParser failed, returning empty string', e);
    return '';
  }

  if (!doc || !doc.body) return '';

  function cleanNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    // DANGEROUS tags: fully remove tag AND all descendants
    if (DANGEROUS_TAGS.has(tag)) {
      node.remove();
      return;
    }

    // UNKNOWN benign tags: unwrap (keep children, remove tag wrapper)
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = node.parentNode;
      if (parent) {
        while (node.firstChild) {
          parent.insertBefore(node.firstChild, node);
        }
        parent.removeChild(node);
      }
      return;
    }

    // --- Attribute filtering for allowed tags ---
    const tagAllowed = ALLOWED_ATTRS[tag];
    const attrs = [...node.attributes];

    for (const attr of attrs) {
      const name = attr.name.toLowerCase();

      // Always remove event handlers and style attributes
      if (name.startsWith('on') || name === 'style') {
        node.removeAttribute(attr.name);
        continue;
      }

      // Handle class attribute separately
      if (name === 'class') {
        const classes = attr.value.split(/\s+/).filter(isAllowedClass);
        if (classes.length > 0) {
          node.setAttribute('class', classes.join(' '));
        } else {
          node.removeAttribute('class');
        }
        continue;
      }

      // Check against tag-specific whitelist
      if (!tagAllowed || !tagAllowed.has(name)) {
        node.removeAttribute(attr.name);
        continue;
      }

      // Validate URL attributes
      if (name === 'href' || name === 'src') {
        if (!isSafeUrl(attr.value, name)) {
          node.removeAttribute(attr.name);
        }
      }
    }

    // Force safe link attributes on all anchors
    if (tag === 'a') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }

    // Recursively clean children (snapshot array to avoid mutation issues)
    const children = [...node.childNodes];
    for (const child of children) {
      cleanNode(child);
    }
  }

  // Clean children of body — NOT body itself (body is not in ALLOWED_TAGS
  // and would be unwrapped/destroyed, nullifying doc.body)
  const bodyChildren = [...doc.body.childNodes];
  for (const child of bodyChildren) {
    cleanNode(child);
  }

  return doc.body.innerHTML;
}

/**
 * Normalize a journal entry for consistent frontend rendering.
 * 
 * IMPORTANT: This is a DEFENSIVE frontend utility, not the primary source of truth.
 * The backend/API (getClientJournalEntries) should already return normalized entries.
 * This function exists as a safety net for UI stability when consuming raw entity data
 * directly (e.g., from base44.entities.JournalEntry.filter() in admin views).
 * 
 * Normalization rules:
 * - photos, attachments, links: always arrays (never null/undefined)
 * - Legacy url field: converted to links[] entry if links is empty
 * - content_html: preserved if present; null signals plain-text fallback
 * - content_fallback: always a string (for legacy plain text rendering)
 * 
 * The deprecated `url` field is NOT propagated beyond the fallback conversion.
 * On resave, the update flow clears `url` to prevent data pollution.
 */
export function normalizeJournalEntry(entry) {
  if (!entry) return entry;

  const normalized = { ...entry };

  // Ensure arrays are always arrays
  normalized.photos = Array.isArray(entry.photos) ? entry.photos : [];
  normalized.attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
  normalized.links = Array.isArray(entry.links) ? entry.links : [];

  // Normalize legacy url into links if links is empty
  if (entry.url && typeof entry.url === 'string' && entry.url.trim() && normalized.links.length === 0) {
    normalized.links = [{
      id: 'legacy-url',
      name: 'External Link',
      description: '',
      url: entry.url,
      type: 'external',
    }];
  }

  // Determine display content: prefer content_html, fallback to content
  if (entry.content_html) {
    normalized.content_html = entry.content_html;
  } else if (entry.content) {
    // Legacy plain text — signal to renderer to use plain text fallback
    normalized.content_html = null;
  }

  normalized.content_fallback = entry.content || '';

  return normalized;
}

/**
 * Generate a temporary client-side ID for link records.
 * 
 * This is a UI HELPER for creating new links in the editor.
 * It is NOT a canonical backend identity generator.
 * 
 * When editing existing entries, preserve backend-assigned link IDs.
 * Only use this for newly added links that don't yet have an ID.
 */
export function generateLinkId() {
  return 'link_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}