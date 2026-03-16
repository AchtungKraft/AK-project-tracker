/**
 * Journal HTML Sanitizer
 * 
 * Strips unsafe tags/attributes from HTML content before save and render.
 * Uses a whitelist approach — only allowed tags and attributes pass through.
 */

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

const ALLOWED_ATTRS = {
  a: ['href', 'target', 'rel', 'title', 'class'],
  img: ['src', 'alt', 'title', 'class', 'width', 'height'],
  th: ['colspan', 'rowspan', 'class'],
  td: ['colspan', 'rowspan', 'class'],
  '*': ['class'],
};

/**
 * Sanitize HTML string by parsing through DOM and stripping disallowed elements/attributes.
 * Works in browser environment only.
 */
export function sanitizeJournalHtml(html) {
  if (!html || typeof html !== 'string') return '';
  
  // Trim and check for empty/whitespace-only content
  const trimmed = html.trim();
  if (!trimmed) return '';
  
  let parser;
  let doc;
  try {
    parser = new DOMParser();
    doc = parser.parseFromString(trimmed, 'text/html');
  } catch (e) {
    console.warn('DOMParser failed in sanitizeJournalHtml:', e);
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
    
    // Remove script, style, iframe, form, and any non-whitelisted tags
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
    
    // Remove disallowed attributes
    const allowedForTag = new Set([
      ...(ALLOWED_ATTRS[tag] || []),
      ...(ALLOWED_ATTRS['*'] || []),
    ]);
    
    const attrs = [...node.attributes];
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      
      if (name.startsWith('on') || name === 'style') {
        node.removeAttribute(attr.name);
        continue;
      }
      
      if (!allowedForTag.has(name)) {
        node.removeAttribute(attr.name);
        continue;
      }
      
      if (name === 'href' || name === 'src') {
        const val = attr.value.trim().toLowerCase();
        if (val.startsWith('javascript:') || val.startsWith('data:text')) {
          node.removeAttribute(attr.name);
        }
      }
    }
    
    if (tag === 'a') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    
    // Recursively clean children (snapshot to avoid mutation issues)
    const children = [...node.childNodes];
    for (const child of children) {
      cleanNode(child);
    }
  }
  
  cleanNode(doc.body);
  return doc.body.innerHTML;
}

/**
 * Normalize a journal entry for consistent rendering.
 * Handles legacy content/url fields.
 */
export function normalizeJournalEntry(entry) {
  if (!entry) return entry;
  
  const normalized = { ...entry };
  
  // Ensure arrays are always arrays
  normalized.photos = Array.isArray(entry.photos) ? entry.photos : [];
  normalized.attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
  normalized.links = Array.isArray(entry.links) ? entry.links : [];
  
  // Normalize legacy url into links if links is empty
  if (entry.url && normalized.links.length === 0) {
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
    // Legacy plain text — wrap in paragraphs for consistent rendering
    normalized.content_html = null; // Signal to renderer to use plain text fallback
  }
  
  normalized.content_fallback = entry.content || '';
  
  return normalized;
}

/**
 * Generate a stable ID for link records.
 */
export function generateLinkId() {
  return 'link_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}