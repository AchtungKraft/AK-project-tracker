import React, { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import SHOP_REVIEW_STYLES from "./shopReviewPrintStyles";
import { buildShopHierarchy } from "./shopReviewHelpers";
import useImagesReady from "./useImagesReady";
import ShopReviewItem from "./ShopReviewItem";

/** Technician print: notes, images and hours for every scope item. Contains no pricing. */
export default function ShopReviewPrintView({ data, onClose }) {
  const [filter, setFilter] = useState("all");
  const rootRef = useRef(null);
  const items = useMemo(
    () => (filter === "approved" ? data.items.filter((i) => i.decision_status === "approved") : data.items),
    [data.items, filter]
  );
  const hierarchy = useMemo(() => buildShopHierarchy(data.categories, data.groups, items), [data, items]);
  const { loaded, total, ready } = useImagesReady(rootRef, [hierarchy]);

  return (
    <>
      <style>{SHOP_REVIEW_STYLES}</style>
      <div className="sr-bar">
        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>Shop Review — Print Preview</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={`sr-btn ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All items</button>
          <button className={`sr-btn ${filter === "approved" ? "on" : ""}`} onClick={() => setFilter("approved")}>Approved only</button>
          <button className="sr-btn on" disabled={!ready} onClick={() => window.print()}>
            {ready ? "Print / Save PDF" : `Loading images ${loaded}/${total}…`}
          </button>
          <button className="sr-btn" onClick={onClose}>Close</button>
        </div>
      </div>
      <div id="shop-review-root" ref={rootRef}>
        <div style={{ fontSize: "7.5pt", letterSpacing: ".15em", fontWeight: 700 }}>ÄCHTUNG KRAFT · INTERNAL SHOP COPY</div>
        <div style={{ fontSize: "15pt", fontWeight: 800, marginTop: 2 }}>Shop Review — Notes, Images &amp; Hours</div>
        <div style={{ fontSize: "10.5pt", fontWeight: 600 }}>{data.request.title}</div>
        <div style={{ color: "#444", marginBottom: 6 }}>
          {data.project?.name || "—"}{data.project?.vin ? ` · VIN ${data.project.vin}` : ""} · {filter === "approved" ? "Approved items" : "All items"} ({items.length}) · Printed {format(new Date(), "MMM d, yyyy")}
        </div>
        {items.length === 0 && <div className="sr-muted">No scope items to show.</div>}
        {hierarchy.map((cat) => (
          <div key={cat.id}>
            <div className="sr-cat">{cat.name} <span style={{ fontWeight: 500, fontSize: "8.5pt" }}>· {cat.count} item(s)</span></div>
            {cat.groups.map((grp) => (
              <div key={grp.id}>
                <div className="sr-grp">{grp.name}</div>
                {grp.items.map((item) => (
                  <ShopReviewItem key={item.id} item={item} categoryName={cat.name} groupName={grp.name} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}