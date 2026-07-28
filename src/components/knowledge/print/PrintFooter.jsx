import React from "react";
import { format } from "date-fns";

/**
 * Print footer — appears at the bottom of the printed document.
 * For repeating page footers, CSS @page is used separately.
 */
export default function PrintFooter({ article }) {
  return (
    <div className="print-footer">
      <span>{article.title}{article.version ? ` · v${article.version}` : ''}</span>
      <span>Printed {format(new Date(), 'MMM d, yyyy')}</span>
    </div>
  );
}