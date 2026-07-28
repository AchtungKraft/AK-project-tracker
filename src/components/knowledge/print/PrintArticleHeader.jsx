import React from "react";
import { format } from "date-fns";

/**
 * Print article header — compact, informative, no interactive controls.
 */
export default function PrintArticleHeader({ article, subsystemPath, entryCounts, coverImage }) {
  return (
    <div className="print-header">
      <div className="print-header-top">
        {coverImage && (
          <img src={coverImage} alt="" className="print-header-thumb" />
        )}
        <div className="print-header-text">
          <h1 className="print-title">{article.title}</h1>
          {subsystemPath && <p className="print-subsystem">{subsystemPath}</p>}
        </div>
      </div>

      {article.summary && (
        <p className="print-summary">{article.summary}</p>
      )}

      <div className="print-meta-row">
        {article.vehicle_tags?.map(tag => (
          <span key={tag} className="print-vehicle-tag">{tag}</span>
        ))}
        <PrintEntryCounts counts={entryCounts} />
        {article.version && <span className="print-meta-item">v{article.version}</span>}
        <span className="print-meta-item">Printed {format(new Date(), 'MMM d, yyyy')}</span>
      </div>
    </div>
  );
}

function PrintEntryCounts({ counts }) {
  if (!counts.displayParts?.length) return null;
  return <span className="print-meta-item">{counts.displayParts.join(' · ')}</span>;
}