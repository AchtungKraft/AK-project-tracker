import { sanitizeJournalHtml } from "@/components/journal/journalSanitizer";
import { JournalProseStyles } from "@/components/journal/JournalContentRenderer";

const LIST_INDENT_STYLES = `
.comment-html-content ol,
.comment-html-content ul {
  padding-left: 1.5rem !important;
  margin-left: 0 !important;
}
.comment-html-content ol ol,
.comment-html-content ul ul,
.comment-html-content ol ul,
.comment-html-content ul ol {
  padding-left: 1.5rem !important;
}
.comment-html-content li {
  margin: 0.25rem 0;
}
.comment-html-content ol {
  list-style-type: decimal;
}
.comment-html-content ol ol {
  list-style-type: lower-alpha;
}
.comment-html-content ol ol ol {
  list-style-type: lower-roman;
}
.comment-html-content ul {
  list-style-type: disc;
}
.comment-html-content ul ul {
  list-style-type: circle;
}
.comment-html-content ul ul ul {
  list-style-type: square;
}
`;

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
        <style dangerouslySetInnerHTML={{ __html: LIST_INDENT_STYLES }} />
        <div
          className={`comment-html-content journal-content journal-table-wrap prose prose-invert max-w-none ${className}`}
          dangerouslySetInnerHTML={{ __html: safe }}
        />
      </>
    );
  }

  return <p className={`text-gray-300 whitespace-pre-wrap ${className}`}>{value}</p>;
}