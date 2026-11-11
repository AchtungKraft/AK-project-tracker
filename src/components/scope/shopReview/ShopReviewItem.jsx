import React from "react";
import { format } from "date-fns";
import { CONVERSION_LABELS, statusLabel, hoursText, laborTotal } from "./shopReviewHelpers";
import ShopReviewImages from "./ShopReviewImages";
import ShopReviewTechFields from "./ShopReviewTechFields";

const fmtDate = (d) => { try { return format(new Date(d), "MMM d, yyyy"); } catch { return ""; } };

/** One scope item: notes, hours, images and blank review fields. No pricing. */
export default function ShopReviewItem({ item, categoryName, groupName }) {
  return (
    <section className="sr-item">
      <div className="sr-item-head">
        <div className="sr-crumb">{categoryName} › {groupName}</div>
        <div className="sr-title">{item.title}</div>
        <div className="sr-status">
          <span className="sr-chip">{statusLabel(item.decision_status)}</span>
          <span className="sr-chip soft">{CONVERSION_LABELS[item.conversion]}{item.tasks.length ? `: ${item.tasks.join(", ")}` : ""}</span>
          {item.decision_at && <span>Decided {fmtDate(item.decision_at)}</span>}
        </div>
        <div className="sr-label">Scope description</div>
        <div className="sr-text">{item.description || <span className="sr-muted">No description.</span>}</div>
      </div>

      {(item.parts_notes.length > 0 || item.parts_tbd) && <>
        <div className="sr-label">Parts/materials notes</div>
        {item.parts_notes.map((n, i) => <div key={i} className="sr-text">{n}</div>)}
        {item.parts_tbd && <div className="sr-muted">Parts/materials still to be determined.</div>}
      </>}

      <div className="sr-label">Labor — estimated hours</div>
      {item.labor.length === 0
        ? <div className="sr-muted">Hours TBD — no labor estimate.</div>
        : <div className="sr-labor">
            {item.labor.map((l, i) => <span key={i}>{l.activity} <b>{hoursText(l.hours_min, l.hours_max)}</b></span>)}
            {item.labor.length > 1 && <span className="sr-total">Total hours <b>{laborTotal(item.labor)}</b></span>}
          </div>}

      {item.comments.length > 0 && <>
        <div className="sr-label">Discussion notes</div>
        {item.comments.map((c, i) => (
          <div key={i} style={{ marginBottom: 2 }}>
            <strong>{c.author}</strong>{c.posted_at && <span style={{ color: "#555" }}> · {fmtDate(c.posted_at)}</span>}
            <div className="sr-text">{c.body}</div>
          </div>
        ))}
      </>}

      <div className="sr-label">Reference images ({item.images.length})</div>
      <ShopReviewImages images={item.images} />
      <ShopReviewTechFields />
    </section>
  );
}