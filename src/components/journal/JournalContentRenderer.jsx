import React from "react";
import { sanitizeJournalHtml, normalizeJournalEntry } from "./journalSanitizer";
import { getLinkTypeIcon } from "./JournalLinksEditor";
import { Paperclip } from "lucide-react";

/**
 * Renders the body content of a journal entry.
 * Handles both rich HTML (content_html) and legacy plain text (content).
 */
export function JournalBodyRenderer({ entry }) {
  const normalized = normalizeJournalEntry(entry);
  
  if (normalized.content_html) {
    const cleanHtml = sanitizeJournalHtml(normalized.content_html);
    return (
      <div 
        className="journal-prose prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    );
  }
  
  // Legacy plain text fallback
  if (normalized.content_fallback) {
    return (
      <div className="prose prose-invert max-w-none">
        <p className="text-gray-200 text-base leading-relaxed whitespace-pre-wrap">
          {normalized.content_fallback}
        </p>
      </div>
    );
  }
  
  return null;
}

/**
 * Renders the structured links section of a journal entry.
 */
export function JournalLinksRenderer({ entry, compact = false }) {
  const normalized = normalizeJournalEntry(entry);
  const links = normalized.links;
  
  if (!links || links.length === 0) return null;
  
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {links.map((link, idx) => {
        const Icon = getLinkTypeIcon(link.type);
        const href = link.url?.startsWith('http') ? link.url : `https://${link.url}`;
        
        return (
          <a
            key={link.id || idx}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-start gap-2.5 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 transition-colors group"
          >
            <Icon className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0 group-hover:text-red-300" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white group-hover:text-red-300 transition-colors truncate">
                {link.name || link.url}
              </div>
              {link.description && (
                <div className="text-xs text-gray-500 truncate">{link.description}</div>
              )}
              {link.name && (
                <div className="text-xs text-gray-600 font-mono truncate">{link.url}</div>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}

/**
 * Renders attachments for a journal entry.
 */
export function JournalAttachmentsRenderer({ entry }) {
  const attachments = Array.isArray(entry?.attachments) ? entry.attachments : [];
  
  if (attachments.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-800">
      {attachments.map((att, idx) => (
        <a
          key={idx}
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white px-3 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Paperclip className="w-4 h-4" />
          {att.name}
        </a>
      ))}
    </div>
  );
}

/**
 * Global styles for journal rich content rendering.
 * Include this once in any page that renders journal HTML.
 */
export function JournalProseStyles() {
  return (
    <style>{`
      .journal-prose {
        color: rgb(229, 231, 235);
        line-height: 1.75;
      }
      .journal-prose h1 { font-size: 1.5em; font-weight: 700; margin: 0.75em 0 0.25em; color: white; }
      .journal-prose h2 { font-size: 1.25em; font-weight: 600; margin: 0.75em 0 0.25em; color: white; }
      .journal-prose h3 { font-size: 1.1em; font-weight: 600; margin: 0.75em 0 0.25em; color: white; }
      .journal-prose h4 { font-size: 1em; font-weight: 600; margin: 0.5em 0 0.25em; color: white; }
      .journal-prose p { margin: 0.5em 0; }
      .journal-prose strong, .journal-prose b { color: white; font-weight: 600; }
      .journal-prose em, .journal-prose i { font-style: italic; }
      .journal-prose u { text-decoration: underline; }
      .journal-prose s { text-decoration: line-through; }
      .journal-prose ul { list-style-type: disc; padding-left: 1.5em; margin: 0.5em 0; }
      .journal-prose ol { list-style-type: decimal; padding-left: 1.5em; margin: 0.5em 0; }
      .journal-prose li { margin: 0.25em 0; }
      .journal-prose blockquote {
        border-left: 3px solid rgb(127, 29, 29);
        padding-left: 1em;
        color: rgb(156, 163, 175);
        margin: 0.75em 0;
        font-style: italic;
      }
      .journal-prose pre {
        background: rgb(17, 24, 39);
        border-radius: 0.375rem;
        padding: 0.75em 1em;
        overflow-x: auto;
        margin: 0.75em 0;
        font-family: ui-monospace, monospace;
        font-size: 0.875em;
        color: rgb(167, 243, 208);
      }
      .journal-prose code {
        background: rgb(17, 24, 39);
        padding: 0.15em 0.35em;
        border-radius: 0.25rem;
        font-family: ui-monospace, monospace;
        font-size: 0.875em;
        color: rgb(167, 243, 208);
      }
      .journal-prose pre code {
        background: none;
        padding: 0;
      }
      .journal-prose a {
        color: rgb(248, 113, 113);
        text-decoration: underline;
      }
      .journal-prose a:hover {
        color: rgb(252, 165, 165);
      }
      .journal-prose img {
        max-width: 100%;
        height: auto;
        border-radius: 0.5rem;
        margin: 0.75em 0;
      }
      .journal-prose hr {
        border-color: rgb(55, 65, 81);
        margin: 1em 0;
      }
      .journal-prose table {
        border-collapse: collapse;
        width: 100%;
        margin: 0.75em 0;
        font-size: 0.9em;
      }
      .journal-prose table th {
        background: rgb(31, 41, 55);
        border: 1px solid rgb(55, 65, 81);
        padding: 0.5em 0.75em;
        text-align: left;
        font-weight: 600;
        color: white;
      }
      .journal-prose table td {
        border: 1px solid rgb(55, 65, 81);
        padding: 0.5em 0.75em;
        color: rgb(209, 213, 219);
      }
      .journal-prose table tr:hover td {
        background: rgb(17, 24, 39);
      }
      
      /* Responsive table wrapper */
      .journal-table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
    `}</style>
  );
}