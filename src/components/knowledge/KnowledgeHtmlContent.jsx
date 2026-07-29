import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import normalizeKnowledgeHtml from "./normalizeKnowledgeHtml";

/**
 * Canonical HTML content renderer for Build Knowledge.
 * 
 * ALL knowledge HTML must flow through this component (or normalizeKnowledgeHtml).
 * Provides:
 * - Security sanitization (strips scripts, event handlers, dangerous attributes)
 * - Quill ql-indent-* → true nested list conversion
 * - Consistent typography scoped to knowledge content
 * - Nested list markers: decimal → lower-alpha → lower-roman → decimal
 * - Responsive images and tables
 * - Long URL wrapping
 * - Empty-paragraph collapse
 */

/**
 * KnowledgeHtmlContent — canonical renderer for all knowledge HTML.
 * 
 * @param {string} html - Raw HTML content (may contain Quill ql-indent classes)
 * @param {string} className - Additional classes
 * @param {string} size - 'sm' | 'base' | 'lg' — controls text size
 */
export default function KnowledgeHtmlContent({ html, className, size = 'sm' }) {
  const normalized = useMemo(() => normalizeKnowledgeHtml(html), [html]);
  
  if (!normalized) return null;
  
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
      dangerouslySetInnerHTML={{ __html: normalized }}
    />
  );
}

// Export the normalizer for use in print views and other contexts
export { normalizeKnowledgeHtml as sanitizeHtml };