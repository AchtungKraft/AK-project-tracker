import React, { useState } from "react";

function Figure({ url, single }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={`sr-fig${single ? " single" : ""}`}>
      {failed
        ? <span className="sr-muted" style={{ fontSize: "8pt", padding: 6 }}>Image could not be loaded</span>
        : <img src={url} alt="Reference" loading="eager" decoding="sync" onError={() => setFailed(true)} />}
    </figure>
  );
}

/** All reference images for one item, two per row, kept whole across pages. */
export default function ShopReviewImages({ images }) {
  if (!images.length) return <div className="sr-muted">No reference images.</div>;
  return (
    <div className="sr-imgs">
      {images.map((url, i) => <Figure key={`${url}-${i}`} url={url} single={images.length === 1} />)}
    </div>
  );
}