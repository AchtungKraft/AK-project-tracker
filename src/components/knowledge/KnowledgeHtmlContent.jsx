import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical HTML content renderer for Build Knowledge.
 * 
 * ALL knowledge HTML must flow through this component.
 * Provides:
 * - Basic sanitization (strips scripts, event handlers, dangerous attributes)
 * - Consistent typography scoped to knowledge content
 * - Responsive images and tables
 * - Long URL wrapping
 * - Empty-paragraph collapse
 */

// Attributes that could execute code
const DANGEROUS_ATTRS = /\s(on\w+|srcdoc|formaction)\s*=/gi;
// Script/iframe/object tags
const DANGEROUS_TAGS = /<\s*(script|iframe|object|embed|applet|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(script|iframe|object|embed|applet|form)\b[^>]*\/?>/gi;
// Style attributes with javascript: or expression()
const DANGEROUS_STYLES = /javascript\s*:|expression\s*\(/gi;
// Clean up pasted Word/Docs artifacts
const WORD_ARTIFACTS = /class="(Mso\w+|ql-\w+)"/gi;
const EMPTY_SPANS = /<span\s*(?:style="[^"]*")?\s*>([\s\S]*?)<\/span>/gi;
// Collapse excessive empty paragraphs
const EMPTY_PARAGRAPHS = /(<p>\s*(?:<br\s*\/?>)?\s*<\/p>\s*){2,}/gi;

function sanitizeHtml(html) {
  if (!html) return '';
  
  let clean = html;
  
  // Remove dangerous tags
  clean = clean.replace(DANGEROUS_TAGS, '');
  
  // Remove dangerous attributes
  clean = clean.replace(DANGEROUS_ATTRS, ' data-removed=');
  
  // Remove javascript: in styles
  clean = clean.replace(DANGEROUS_STYLES, '');
  
  // Clean Word/Docs artifacts
  clean = clean.replace(WORD_ARTIFACTS, '');
  
  // Remove font-family and font-size inline styles (paste normalization)
  clean = clean.replace(/font-family\s*:\s*[^;"]*(;|")/gi, (match) => match.endsWith('"') ? '"' : '');
  clean = clean.replace(/font-size\s*:\s*[^;"]*(;|")/gi, (match) => match.endsWith('"') ? '"' : '');
  
  // Remove background-color inline styles
  clean = clean.replace(/background-color\s*:\s*[^;"]*(;|")/gi, (match) => match.endsWith('"') ? '"' : '');
  
  // Remove color inline styles (except for genuinely needed ones)
  clean = clean.replace(/(?<!border-)color\s*:\s*[^;"]*(;|")/gi, (match) => match.endsWith('"') ? '"' : '');
  
  // Unwrap empty spans (common paste artifact)
  clean = clean.replace(EMPTY_SPANS, '$1');
  
  // Collapse multiple empty paragraphs to one
  clean = clean.replace(EMPTY_PARAGRAPHS, '<p><br></p>');
  
  // Clean empty style attributes
  clean = clean.replace(/\s+style="\s*"/gi, '');
  
  return clean;
}

/**
 * KnowledgeHtmlContent — canonical renderer for all knowledge HTML.
 * 
 * @param {string} html - Raw HTML content
 * @param {string} className - Additional classes
 * @param {string} size - 'sm' | 'base' | 'lg' — controls text size
 */
export default function KnowledgeHtmlContent({ html, className, size = 'sm' }) {
  const sanitized = useMemo(() => sanitizeHtml(html), [html]);
  
  if (!sanitized || sanitized === '<p><br></p>' || sanitized.trim() === '') {
    return null;
  }
  
  const sizeClasses = {
    sm: 'text-sm leading-relaxed',
    base: 'text-[15px] leading-[1.7]',
    lg: 'text-base leading-relaxed',
  };

  return (
    <div
      className={cn(
        // Base typography
        "knowledge-html-content max-w-none",
        sizeClasses[size] || sizeClasses.sm,
        // Colors
        "text-gray-300",
        // Links
        "[&_a]:text-blue-400 [&_a]:underline [&_a]:break-words",
        // Images — responsive, no overflow
        "[&_img]:rounded-lg [&_img]:my-2 [&_img]:max-w-full [&_img]:h-auto",
        // Lists
        "[&_ul]:ml-4 [&_ol]:ml-4 [&_li]:text-gray-300 [&_ul]:list-disc [&_ol]:list-decimal",
        // Headings
        "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-1",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-1",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-2 [&_h3]:mb-1",
        // Paragraphs — prevent excessive spacing
        "[&_p]:my-0.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // Blockquotes
        "[&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:text-gray-400 [&_blockquote]:pl-3 [&_blockquote]:ml-0 [&_blockquote]:my-2",
        // Code
        "[&_code]:bg-gray-800 [&_code]:text-red-400 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs",
        "[&_pre]:bg-gray-800 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-2 [&_pre]:text-xs",
        // Tables — responsive
        "[&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_table]:text-sm",
        "[&_th]:border [&_th]:border-gray-700 [&_th]:bg-gray-800/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-gray-300",
        "[&_td]:border [&_td]:border-gray-700 [&_td]:px-2 [&_td]:py-1 [&_td]:text-gray-400",
        // Horizontal rules
        "[&_hr]:border-gray-700 [&_hr]:my-4",
        // Prevent overflow
        "overflow-x-hidden break-words",
        className
      )}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

// Export sanitizer for use in print views and other contexts
export { sanitizeHtml };