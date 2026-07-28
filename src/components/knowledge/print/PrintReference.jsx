import React from "react";

/**
 * Compact reference URL display for print.
 * Truncates protocol and long paths for readability.
 */
export default function PrintReference({ url }) {
  if (!url) return null;

  // Build a short display label
  let display = url;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 30
      ? parsed.pathname.slice(0, 28) + '…'
      : parsed.pathname;
    display = parsed.hostname + (path !== '/' ? path : '');
  } catch {
    // If URL parsing fails, just show the raw url truncated
    if (display.length > 60) {
      display = display.slice(0, 58) + '…';
    }
  }

  return (
    <div className="print-reference-url">
      <span className="print-reference-label">Reference:</span>{' '}
      <a href={url} className="print-reference-link">{display}</a>
    </div>
  );
}