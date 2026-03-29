import { sanitizeJournalHtml } from "@/components/journal/journalSanitizer";
import { JournalProseStyles } from "@/components/journal/JournalContentRenderer";

/**
 * Shared HTML content renderer.
 * Uses the same sanitization pipeline as the client portal for consistent rendering.
 * 
 * Priority: html → fallback → nothing
 * If the content contains HTML tags, renders with prose styling.
 * Otherwise falls back to plain text whitespace-pre-wrap.
 */

function isHtml(str) {
  if (!str) return false;
  return /<[a-z][\s\S]*>/i.test(str);
}

export default function HtmlContent({ html, fallback, className = "" }) {
  const value = html || fallback || "";
  if (!value.trim()) return null;

  if (isHtml(value)) {
    const safe = sanitizeJournalHtml(value);
    return (
      <>
        <JournalProseStyles />
        <div
          className={`journal-content journal-table-wrap prose prose-invert max-w-none ${className}`}
          dangerouslySetInnerHTML={{ __html: safe }}
        />
      </>
    );
  }

  return <p className={`text-gray-300 whitespace-pre-wrap ${className}`}>{value}</p>;
}