/**
 * normalizeKnowledgeHtml — Canonical HTML normalization for Build Knowledge.
 *
 * Converts Quill's flat ql-indent-* list output into true nested <ol>/<ul>,
 * sanitizes dangerous content, and preserves semantic formatting.
 *
 * Uses DOMParser (browser-native) for reliable HTML parsing — no regex-based
 * structural manipulation.
 *
 * This function is IDEMPOTENT: normalizeKnowledgeHtml(normalizeKnowledgeHtml(x)) === normalizeKnowledgeHtml(x)
 */

// ── Security patterns ──
const DANGEROUS_ATTRS = /\s(on\w+|srcdoc|formaction)\s*=/gi;
const DANGEROUS_TAGS_RE = /<\s*(script|iframe|object|embed|applet|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(script|iframe|object|embed|applet|form)\b[^>]*\/?>/gi;
const DANGEROUS_STYLES_RE = /javascript\s*:|expression\s*\(/gi;

// ── Paste cleanup patterns ──
const EMPTY_PARAGRAPHS = /(<p>\s*(?:<br\s*\/?>)?\s*<\/p>\s*){2,}/gi;

/**
 * Convert Quill flat ql-indent-* list items into properly nested HTML lists.
 * Works with a real DOM tree for reliability.
 */
function nestQuillLists(container) {
  // Process each <ol> and <ul> in the container
  const lists = container.querySelectorAll('ol, ul');
  
  lists.forEach(list => {
    const items = Array.from(list.children).filter(el => el.tagName === 'LI');
    if (items.length === 0) return;
    
    // Check if any items have ql-indent classes
    const hasIndents = items.some(li => {
      for (let i = 1; i <= 8; i++) {
        if (li.classList.contains(`ql-indent-${i}`)) return true;
      }
      return false;
    });
    if (!hasIndents) return;
    
    // Build a tree structure from flat items
    const getIndentLevel = (li) => {
      for (let i = 8; i >= 1; i--) {
        if (li.classList.contains(`ql-indent-${i}`)) return i;
      }
      return 0;
    };
    
    // Determine list type for nested lists based on parent
    const parentTag = list.tagName.toLowerCase(); // 'ol' or 'ul'
    
    // Create the nested structure
    const rootItems = [];
    const stack = []; // { level, li, children[] }
    
    items.forEach(li => {
      const level = getIndentLevel(li);
      
      // Remove ql-indent classes from the li
      for (let i = 1; i <= 8; i++) {
        li.classList.remove(`ql-indent-${i}`);
      }
      // Clean up empty class attribute
      if (li.classList.length === 0) li.removeAttribute('class');
      
      const node = { level, li, children: [] };
      
      if (level === 0) {
        rootItems.push(node);
        stack.length = 0;
        stack.push(node);
      } else {
        // Find the parent — walk back the stack to find the nearest item at level-1
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }
        if (stack.length > 0) {
          stack[stack.length - 1].children.push(node);
        } else {
          // Orphan indent — no parent at lower level, attach to last root or create one
          if (rootItems.length > 0) {
            rootItems[rootItems.length - 1].children.push(node);
          } else {
            // Force as root
            node.level = 0;
            rootItems.push(node);
          }
        }
        stack.push(node);
      }
    });
    
    // Recursively build the nested DOM
    function buildNestedList(nodes, doc, tag) {
      const newList = doc.createElement(tag);
      nodes.forEach(node => {
        const newLi = node.li.cloneNode(true);
        if (node.children.length > 0) {
          const childList = buildNestedList(node.children, doc, tag);
          newLi.appendChild(childList);
        }
        newList.appendChild(newLi);
      });
      return newList;
    }
    
    const doc = container.ownerDocument;
    const nestedList = buildNestedList(rootItems, doc, parentTag);
    
    // Replace the original list with the nested one
    list.parentNode.replaceChild(nestedList, list);
  });
}

/**
 * Sanitize HTML — remove dangerous content while preserving semantic formatting.
 * Uses regex only for security stripping (no structural parsing).
 */
function sanitizeContent(html) {
  if (!html) return '';
  
  let clean = html;
  
  // Remove dangerous tags
  clean = clean.replace(DANGEROUS_TAGS_RE, '');
  
  // Remove dangerous attributes
  clean = clean.replace(DANGEROUS_ATTRS, ' data-removed=');
  
  // Remove javascript: in styles
  clean = clean.replace(DANGEROUS_STYLES_RE, '');
  
  // Remove font-family, font-size, background-color, color inline styles (paste cleanup)
  clean = clean.replace(/font-family\s*:\s*[^;"]*(;|")/gi, (m) => m.endsWith('"') ? '"' : '');
  clean = clean.replace(/font-size\s*:\s*[^;"]*(;|")/gi, (m) => m.endsWith('"') ? '"' : '');
  clean = clean.replace(/background-color\s*:\s*[^;"]*(;|")/gi, (m) => m.endsWith('"') ? '"' : '');
  clean = clean.replace(/(?<!border-)color\s*:\s*[^;"]*(;|")/gi, (m) => m.endsWith('"') ? '"' : '');
  
  // Remove Word-specific classes (Mso*) but KEEP ql-indent and ql-align classes
  clean = clean.replace(/class="([^"]*)"/gi, (match, classes) => {
    const filtered = classes.split(/\s+/).filter(c => {
      if (/^Mso/i.test(c)) return false; // Remove Word classes
      return true; // Keep everything else (including ql-indent-*, ql-align-*)
    }).join(' ');
    return filtered ? `class="${filtered}"` : '';
  });
  
  // Remove empty spans (paste artifact) but preserve meaningful ones
  clean = clean.replace(/<span\s*>([\s\S]*?)<\/span>/gi, '$1');
  
  // Clean empty style attributes
  clean = clean.replace(/\s+style="\s*"/gi, '');
  
  // Collapse multiple empty paragraphs to one
  clean = clean.replace(EMPTY_PARAGRAPHS, '<p><br></p>');
  
  // Add rel="noopener noreferrer" and target="_blank" to external links
  clean = clean.replace(/<a\s([^>]*href="https?:\/\/[^"]*"[^>]*)>/gi, (match, attrs) => {
    if (!attrs.includes('target=')) attrs += ' target="_blank"';
    if (!attrs.includes('rel=')) attrs += ' rel="noopener noreferrer"';
    return `<a ${attrs}>`;
  });
  
  // Block javascript: protocol in href
  clean = clean.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  
  return clean;
}

/**
 * Main entry point. Sanitizes + converts Quill indent lists to nested HTML.
 * Returns clean, semantic HTML ready for rendering.
 */
export default function normalizeKnowledgeHtml(html) {
  if (!html) return '';
  
  // Step 1: Security sanitization (regex-safe, no structural changes)
  let clean = sanitizeContent(html);
  
  // Quick bail for empty content
  if (!clean || clean === '<p><br></p>' || clean.trim() === '') return '';
  
  // Step 2: If there are ql-indent classes, use DOMParser for structural conversion
  if (clean.includes('ql-indent-')) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${clean}</div>`, 'text/html');
      const wrapper = doc.body.firstChild;
      
      if (wrapper) {
        nestQuillLists(wrapper);
        clean = wrapper.innerHTML;
      }
    } catch (e) {
      // If DOMParser fails, return the sanitized-but-unconverted HTML
      console.warn('normalizeKnowledgeHtml: DOMParser failed, returning flat HTML', e);
    }
  }
  
  return clean;
}

// Re-export for backward compatibility
export { sanitizeContent as sanitizeHtml };